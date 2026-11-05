// Webhook endpoints, signing and delivery. Deliveries are queued by recordEvent() in events.ts and
// sent by the worker process (scripts/worker.ts), never from a web request.
import crypto from 'node:crypto';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { one, query, setSetting, getSetting } from './db';
import { EVENT_TYPES, NOTIFY_CHANNEL, type EventEnvelope, type EventType } from './events';

// ---------- Signing ----------

// sha256=<hex HMAC-SHA256 of "<timestamp>.<raw body>">, keyed with the endpoint's secret.
export function sign(secret: string, timestamp: number, body: string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

export function deliveryHeaders(event: Pick<EventEnvelope, 'id' | 'type'>, secret: string, body: string, now = Date.now()) {
  const timestamp = Math.floor(now / 1000);
  return {
    'Content-Type': 'application/json',
    'User-Agent': 'FOST-CFP-Webhooks/1',
    'X-FOST-Event-Id': event.id,
    'X-FOST-Event-Type': event.type,
    'X-FOST-Timestamp': String(timestamp),
    'X-FOST-Signature': sign(secret, timestamp, body),
  };
}

export const newSecret = () => `whsec_${crypto.randomBytes(32).toString('hex')}`;

// ---------- Retry schedule ----------

// Delay after each failed attempt: about 1 min, 5 min, 15 min, 1 h, 3 h, 6 h, 12 h and 24 h,
// so the last of 9 attempts is roughly 46 hours after the first. Then the delivery is marked failed.
export const RETRY_DELAYS_MS = [1, 5, 15, 60, 180, 360, 720, 1440].map((m) => m * 60_000);
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
export const TIMEOUT_MS = 10_000;
// How long a worker holds a claimed delivery before another worker may retry it (covers crashes).
const LEASE = '2 minutes';

// ---------- Protecting the server (SSRF) ----------

const blocked = new net.BlockList();
for (const [addr, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) {
  blocked.addSubnet(addr, bits, 'ipv4');
}
for (const [addr, bits] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const) {
  blocked.addSubnet(addr, bits, 'ipv6');
}

// Private, loopback, link-local and other non-public addresses (including IPv4 written as IPv6).
export function isPrivateAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return blocked.check(mapped[1], 'ipv4');
  const family = net.isIP(address);
  if (!family) return true;
  return blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

// In production, webhooks may only reach public addresses. In development, anything goes, so a
// local n8n on localhost can be used.
export const ssrfGuardOn = () => process.env.NODE_ENV === 'production' && !process.env.ALLOW_PRIVATE_WEBHOOKS;

// A DNS lookup that refuses private addresses. Used for the actual connection, so a hostname cannot
// pass a check and then resolve somewhere else.
function guardedLookup(hostname: string, options: dns.LookupOptions, callback: (...args: any[]) => void) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = addresses as dns.LookupAddress[];
    const bad = list.find((a) => isPrivateAddress(a.address));
    if (bad) return callback(Object.assign(new Error(`Refused to send to a private address (${bad.address})`), { code: 'EPRIVATE' }));
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

// ---------- Sending ----------

export interface SendResult { ok: boolean; status: number | null; error: string | null }

// One POST with a 10-second timeout and no redirects. Only a 2xx response counts as delivered.
export function post(url: string, headers: Record<string, string>, body: string, guard = ssrfGuardOn()): Promise<SendResult> {
  return new Promise((resolve) => {
    let u: URL;
    try { u = new URL(url); } catch { return resolve({ ok: false, status: null, error: 'Invalid URL' }); }
    if (guard && net.isIP(u.hostname.replace(/^\[|\]$/g, '')) && isPrivateAddress(u.hostname.replace(/^\[|\]$/g, ''))) {
      return resolve({ ok: false, status: null, error: `Refused to send to a private address (${u.hostname})` });
    }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, {
      method: 'POST',
      headers: { ...headers, 'Content-Length': String(Buffer.byteLength(body)) },
      timeout: TIMEOUT_MS,
      ...(guard ? { lookup: guardedLookup as any } : {}),
    }, (res) => {
      res.resume();
      const status = res.statusCode ?? 0;
      const ok = status >= 200 && status < 300;
      res.on('end', () => resolve({ ok, status, error: ok ? null : `HTTP ${status}` }));
      res.on('error', () => resolve({ ok, status, error: ok ? null : `HTTP ${status}` }));
    });
    // A hard deadline for the whole request, not just idle time.
    const timer = setTimeout(() => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })), TIMEOUT_MS);
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    req.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      resolve({ ok: false, status: null, error: err.code === 'ETIMEDOUT' ? 'timeout' : (err.message || String(err.code)).slice(0, 200) });
    });
    req.on('close', () => clearTimeout(timer));
    req.end(body);
  });
}

// ---------- Endpoints ----------

export interface Endpoint {
  id: number;
  name: string;
  url: string;
  secret: string;
  event_types: EventType[];
  paused: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface EndpointInput { name: string; url: string; event_types: string[] }

const isLocalhost = (host: string) => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host) || host.endsWith('.localhost');

export function validateEndpoint(input: EndpointInput): string[] {
  const errors: string[] = [];
  if (!input.name.trim()) errors.push('Please give the endpoint a name, such as "n8n production".');
  let u: URL | null = null;
  try { u = new URL(input.url.trim()); } catch { /* reported below */ }
  if (!u || !/^https?:$/.test(u.protocol)) errors.push('Please enter the full webhook URL, starting with https://');
  else if (u.protocol === 'http:' && !isLocalhost(u.hostname)) errors.push('The URL must start with https:// (only localhost addresses may use http:// for testing).');
  else if (u.username || u.password) errors.push('Please leave the user name and password out of the URL.');
  if (!input.event_types.length) errors.push('Choose at least one event to send.');
  if (input.event_types.some((t) => !(EVENT_TYPES as readonly string[]).includes(t))) errors.push('Unknown event type.');
  return errors;
}

export function readEndpointForm(form: FormData): EndpointInput {
  return {
    name: String(form.get('name') ?? '').trim(),
    url: String(form.get('url') ?? '').trim(),
    event_types: form.getAll('event_types').map(String),
  };
}

export async function listEndpoints() {
  return query<Endpoint & { pending: number; failed: number; last_delivered_at: string | null }>(`
    SELECT e.*,
      (SELECT COUNT(*) FROM webhook_deliveries d WHERE d.endpoint_id = e.id AND d.status = 'pending') AS pending,
      (SELECT COUNT(*) FROM webhook_deliveries d WHERE d.endpoint_id = e.id AND d.status = 'failed') AS failed,
      (SELECT MAX(delivered_at) FROM webhook_deliveries d WHERE d.endpoint_id = e.id) AS last_delivered_at
    FROM webhook_endpoints e ORDER BY e.id`);
}

export async function getEndpoint(id: number): Promise<Endpoint | null> {
  if (!Number.isInteger(id)) return null;
  return one<Endpoint>('SELECT * FROM webhook_endpoints WHERE id = $1', [id]);
}

// Returns the new endpoint and its secret, which is shown to the organiser once.
export async function createEndpoint(input: EndpointInput, userId: number): Promise<{ id?: number; secret?: string; errors: string[] }> {
  const errors = validateEndpoint(input);
  if (errors.length) return { errors };
  const secret = newSecret();
  const row = await one<{ id: number }>(`INSERT INTO webhook_endpoints (name, url, secret, event_types, created_by)
    VALUES ($1, $2, $3, $4, $5) RETURNING id`, [input.name, input.url, secret, input.event_types, userId]);
  return { id: row!.id, secret, errors: [] };
}

export async function updateEndpoint(id: number, input: EndpointInput): Promise<string[]> {
  const errors = validateEndpoint(input);
  if (errors.length) return errors;
  await query('UPDATE webhook_endpoints SET name = $1, url = $2, event_types = $3, updated_at = now() WHERE id = $4',
    [input.name, input.url, input.event_types, id]);
  return [];
}

export async function setPaused(id: number, paused: boolean): Promise<void> {
  await query('UPDATE webhook_endpoints SET paused = $1, updated_at = now() WHERE id = $2', [paused, id]);
}

// Deleting an endpoint deletes its deliveries, pending ones included.
export async function deleteEndpoint(id: number): Promise<void> {
  await query('DELETE FROM webhook_endpoints WHERE id = $1', [id]);
}

export async function regenerateSecret(id: number): Promise<string> {
  const secret = newSecret();
  await query('UPDATE webhook_endpoints SET secret = $1, updated_at = now() WHERE id = $2', [secret, id]);
  return secret;
}

// ---------- Delivery log ----------

export interface DeliveryLogRow {
  id: number;
  event_id: string;
  event_type: EventType;
  occurred_at: string;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  next_attempt_at: string | null;
  last_attempt_at: string | null;
  last_response_status: number | null;
  last_error: string | null;
  delivered_at: string | null;
  can_resend: boolean;
}

export async function deliveryLog(endpointId: number, limit = 100): Promise<DeliveryLogRow[]> {
  return query<DeliveryLogRow>(`
    SELECT d.id, d.event_id, e.type AS event_type, e.occurred_at, d.status, d.attempts, d.next_attempt_at,
           d.last_attempt_at, d.last_response_status, d.last_error, d.delivered_at, (e.data IS NOT NULL) AS can_resend
    FROM webhook_deliveries d JOIN events e ON e.id = d.event_id
    WHERE d.endpoint_id = $1 ORDER BY d.id DESC LIMIT $2`, [endpointId, limit]);
}

// Sends the same event (same id) again, with a fresh retry schedule.
export async function resendDelivery(endpointId: number, deliveryId: number): Promise<boolean> {
  const rows = await query(`UPDATE webhook_deliveries d SET status = 'pending', attempts = 0, next_attempt_at = now(), last_error = NULL
    FROM events e WHERE e.id = d.event_id AND e.data IS NOT NULL AND d.id = $1 AND d.endpoint_id = $2 RETURNING d.id`, [deliveryId, endpointId]);
  if (rows.length) await query(`SELECT pg_notify('${NOTIFY_CHANNEL}', 'resend')`);
  return rows.length > 0;
}

// ---------- Worker ----------

interface Claimed { id: number; attempts: number; url: string; secret: string; event: EventEnvelope }

// Claims up to `limit` due deliveries for endpoints that are not paused. Each claim is a short lease
// (next_attempt_at moved forward), so several workers never send the same delivery at once, and a
// worker that crashes mid-send leaves it to be retried.
export async function claimDue(limit = 10): Promise<Claimed[]> {
  return query<Claimed>(`
    WITH due AS (
      SELECT d.id FROM webhook_deliveries d JOIN webhook_endpoints ep ON ep.id = d.endpoint_id
      WHERE d.status = 'pending' AND d.next_attempt_at <= now() AND NOT ep.paused
      ORDER BY d.next_attempt_at, d.id
      LIMIT $1
      FOR UPDATE OF d SKIP LOCKED
    )
    UPDATE webhook_deliveries d SET next_attempt_at = now() + interval '${LEASE}'
    FROM due, webhook_endpoints ep, events e
    WHERE d.id = due.id AND ep.id = d.endpoint_id AND e.id = d.event_id
    RETURNING d.id, d.attempts, ep.url, ep.secret,
      json_build_object('id', e.id, 'type', e.type, 'version', e.version,
        'occurred_at', to_char(e.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'data', e.data) AS event`, [limit]);
}

export async function recordAttempt(deliveryId: number, attemptsBefore: number, result: SendResult): Promise<void> {
  const attempts = attemptsBefore + 1;
  if (result.ok) {
    await query(`UPDATE webhook_deliveries SET status = 'delivered', attempts = $2, next_attempt_at = NULL, last_attempt_at = now(),
      last_response_status = $3, last_error = NULL, delivered_at = now() WHERE id = $1`, [deliveryId, attempts, result.status]);
  } else if (attempts >= MAX_ATTEMPTS) {
    await query(`UPDATE webhook_deliveries SET status = 'failed', attempts = $2, next_attempt_at = NULL, last_attempt_at = now(),
      last_response_status = $3, last_error = $4 WHERE id = $1`, [deliveryId, attempts, result.status, result.error]);
  } else {
    await query(`UPDATE webhook_deliveries SET attempts = $2, next_attempt_at = now() + ($5 || ' milliseconds')::interval,
      last_attempt_at = now(), last_response_status = $3, last_error = $4 WHERE id = $1`,
    [deliveryId, attempts, result.status, result.error, String(RETRY_DELAYS_MS[attempts - 1])]);
  }
}

// One pass: claim due deliveries and send them in parallel. Returns how many were attempted.
export async function deliverDue(limit = 10): Promise<number> {
  const claimed = await claimDue(limit);
  await Promise.all(claimed.map(async (c) => {
    const body = JSON.stringify(c.event);
    const result = c.event.data === null
      ? { ok: false, status: null, error: 'Event data expired' }
      : await post(c.url, deliveryHeaders(c.event, c.secret, body), body);
    await recordAttempt(c.id, c.attempts, result);
  }));
  return claimed.length;
}

// Daily: drop event bodies older than 30 days once nothing still needs to send them. The slim rows
// (type, time, status) stay, so the delivery log keeps its history.
export async function purgeOldPayloads(): Promise<number> {
  const rows = await query(`UPDATE events e SET data = NULL
    WHERE e.data IS NOT NULL AND e.occurred_at < now() - interval '30 days'
      AND NOT EXISTS (SELECT 1 FROM webhook_deliveries d WHERE d.event_id = e.id AND d.status = 'pending')
    RETURNING e.id`);
  return rows.length;
}

export const HEARTBEAT_KEY = 'worker_heartbeat';
export const heartbeat = () => setSetting(HEARTBEAT_KEY, new Date().toISOString());
export const lastHeartbeat = () => getSetting(HEARTBEAT_KEY);

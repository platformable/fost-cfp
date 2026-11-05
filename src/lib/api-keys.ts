// API keys for automations such as n8n. Keys look like fost_live_<prefix>_<secret>; only a SHA-256
// hash is stored, plus the prefix so organisers can tell keys apart.
import crypto from 'node:crypto';
import { one, query } from './db';

export const SCOPES = ['read', 'read-write'] as const;
export type Scope = (typeof SCOPES)[number];

export interface ApiKey {
  id: number;
  name: string;
  scope: Scope;
  prefix: string;
  key_hash: string;
  created_by: number | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const hash = (key: string) => crypto.createHash('sha256').update(key).digest('hex');

// Returns the full key, which is shown to the organiser once and never stored.
export async function createApiKey(name: string, scope: string, userId: number): Promise<{ key?: string; id?: number; errors: string[] }> {
  const errors: string[] = [];
  if (!name.trim()) errors.push('Please give the key a name, such as "n8n production".');
  if (!(SCOPES as readonly string[]).includes(scope)) errors.push('Please choose what the key may do.');
  if (errors.length) return { errors };
  const prefix = `fost_live_${crypto.randomBytes(4).toString('hex')}`;
  const key = `${prefix}_${crypto.randomBytes(24).toString('base64url')}`;
  const row = await one<{ id: number }>('INSERT INTO api_keys (name, scope, prefix, key_hash, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [name.trim(), scope, prefix, hash(key), userId]);
  return { key, id: row!.id, errors: [] };
}

export async function listApiKeys(): Promise<Omit<ApiKey, 'key_hash'>[]> {
  return query('SELECT id, name, scope, prefix, created_by, created_at, last_used_at, revoked_at FROM api_keys ORDER BY revoked_at IS NOT NULL, id DESC');
}

export async function revokeApiKey(id: number): Promise<void> {
  await query('UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [id]);
}

// The active key matching `key`, or null. Updates last_used_at at most once a minute.
export async function authenticate(key: string): Promise<ApiKey | null> {
  if (!/^fost_live_[0-9a-f]{8}_[\w-]+$/.test(key)) return null;
  const row = await one<ApiKey>('SELECT * FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL', [hash(key)]);
  if (!row) return null;
  if (!row.last_used_at || Date.now() - Date.parse(row.last_used_at) >= 60_000) {
    await query(`UPDATE api_keys SET last_used_at = now() WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')`, [row.id]);
  }
  return row;
}

// ---------- Rate limit: 600 requests per key per minute, counted in this process ----------

export const RATE_LIMIT = 600;
const WINDOW_MS = 60_000;
const windows = new Map<number, { start: number; count: number }>();

// Returns 0 if the request may go ahead, or the seconds to wait before retrying.
export function rateLimit(keyId: number, now = Date.now()): number {
  let w = windows.get(keyId);
  if (!w || now - w.start >= WINDOW_MS) {
    w = { start: now, count: 0 };
    windows.set(keyId, w);
  }
  w.count += 1;
  if (w.count <= RATE_LIMIT) return 0;
  return Math.max(1, Math.ceil((w.start + WINDOW_MS - now) / 1000));
}

export function resetRateLimits() {
  windows.clear();
}

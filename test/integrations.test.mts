// Integration events, webhook delivery, the worker and the /api/v1/ integration API.
// Runs against TEST_DATABASE_URL (wiped on every run); test files run one at a time.
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Conference } from '../src/lib/conferences';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://fost:fost@localhost:5432/fost_cfp_test';
process.env.BASE_URL = 'http://cfp.test';

const { closePool, one, pool, query, transaction, ensureSecret } = await import('../src/lib/db');
const { migrate } = await import('../src/lib/migrate');
const users = await import('../src/lib/users');
const confs = await import('../src/lib/conferences');
const props = await import('../src/lib/proposals');
const events = await import('../src/lib/events');
const payloads = await import('../src/lib/payloads');
const hooks = await import('../src/lib/webhooks');
const keys = await import('../src/lib/api-keys');
const v1 = await import('../src/lib/api-v1');
const { runWorker } = await import('../src/lib/worker');
const { NextRequest } = await import('next/server');
const exportRoute = await import('../src/app/api/export/[token]/[file]/route');

const form = (data: Record<string, string | number | (string | number)[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(data)) for (const item of [].concat(v as never)) f.append(k, String(item));
  return f;
};

async function newConference(fields: Record<string, string>) {
  const { values, errors } = confs.readConferenceForm(form(fields));
  assert.deepEqual(errors, []);
  const saved = await confs.saveConference(values);
  return (await confs.getConference(saved.id!))!;
}

async function submit(speakerId: number, conferences: Conference[], data: Record<string, string>) {
  const f = form({ ...data, conference_ids: conferences.map((c) => c.id) });
  const common = props.readCommon(f);
  const picks = conferences.map((conf) => ({ conf, ...props.readConferenceChoice(f, conf, { named: conferences.length > 1 }) }));
  const errors = [...common.errors, ...picks.flatMap((p) => p.errors)];
  if (errors.length) return { errors, ids: [] as number[] };
  return { errors, ids: await props.submitProposals(speakerId, common.values, picks.map(({ conf, pick }) => ({ conf, pick }))) };
}

const eventsOfType = (type: string) =>
  query<{ id: string; type: string; data: any }>('SELECT id, type, data FROM events WHERE type = $1 ORDER BY occurred_at, id', [type]);

// A local receiver that records every request and answers with whatever `respond` says.
interface Received { headers: http.IncomingHttpHeaders; body: string }
function receiver() {
  const received: Received[] = [];
  let respond: (r: Received) => number = () => 200;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const r = { headers: req.headers, body };
      received.push(r);
      res.writeHead(respond(r)).end('ok');
    });
  });
  return {
    received,
    setResponse(fn: (r: Received) => number) { respond = fn; },
    async start() { await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok)); return `http://localhost:${(server.address() as AddressInfo).port}/hook`; },
    stop: () => new Promise<void>((ok) => server.close(() => ok())),
  };
}

// Calls a /api/v1/ handler the way Next.js would.
async function api(method: string, path: string, key: string | null, params: Record<string, string> = {}) {
  const handlers: Record<string, ReturnType<typeof v1.v1>> = {
    conferences: v1.v1(v1.listConferences),
    conference: v1.v1(v1.getConference),
    committee: v1.v1(v1.getCommittee),
    proposals: v1.v1(v1.listProposals),
    proposal: v1.v1(v1.getProposal),
    speaker: v1.v1(v1.getSpeaker),
    unknown: v1.v1(v1.unknownPath),
  };
  const route = path.split('?')[0].replace(/^\/api\/v1\//, '');
  const name = route === 'conferences' ? 'conferences'
    : /^conferences\/[^/]+\/committee$/.test(route) ? 'committee'
      : /^conferences\/[^/]+$/.test(route) ? 'conference'
        : route === 'proposals' ? 'proposals'
          : /^proposals\/[^/]+$/.test(route) ? 'proposal'
            : /^speakers\/[^/]+$/.test(route) ? 'speaker' : 'unknown';
  const req = new Request(`http://cfp.test${path}`, { method, headers: key ? { Authorization: `Bearer ${key}` } : {} });
  const res = await (handlers[name] as any)[method](req, { params: Promise.resolve(params) });
  return { status: res.status as number, headers: res.headers as Headers, body: await res.json() };
}

let adminId: number;
let adaId: number;
let graceId: number;
let rex: number;
let conf: Conference;
let other: Conference;

before(async () => {
  await pool().query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool());
  adminId = (await users.register({ first_name: 'Olive', last_name: 'Organiser', email: 'admin@example.com', organization: '' }, 'password123')).user!.id;
  adaId = (await users.register({ first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com', organization: 'Analytical Engines' }, 'password123')).user!.id;
  graceId = (await users.register({ first_name: 'Grace', last_name: 'Hopper', email: 'grace@example.com', organization: '' }, 'password123')).user!.id;
  rex = (await users.register({ first_name: 'Rex', last_name: 'Reviewer', email: 'rex@example.com', organization: '' }, 'password123')).user!.id;
  conf = await newConference({ name: 'Events Conf 2027', location: 'Paris', start_date: '2027-06-10', end_date: '2027-06-11', topics: 'APIs\nAI' });
  other = await newConference({ name: 'Month Conf 2027', date_precision: 'month', start_month: '9', start_year: '2027' });
  await confs.addReviewer(conf.id, 'rex@example.com');
});
after(() => closePool());

describe('payloads', () => {
  test('speaker, proposal and conference objects carry exactly the documented fields', async () => {
    await users.saveProfile(adaId, users.readProfile(form({
      first_name: 'Ada', last_name: 'Lovelace', organization: 'Analytical Engines', job_title: 'Mathematician', bio: 'First programmer.',
      linkedin_profile_url: 'https://www.linkedin.com/in/ada', country: 'GB', photo_url: '', phone: '+44 1234',
    })).values);
    const r = await submit(adaId, [conf], { title: 'Notes on the engine', abstract: 'Abstract.', level: 'Beginner', [`format_${conf.id}`]: 'Talk (25 min)', [`topic_${conf.id}`]: 'APIs' });
    const p = (await payloads.proposalPayloadById(r.ids[0]))!;
    assert.deepEqual(Object.keys(p).sort(), ['abstract', 'co_speakers', 'conference', 'format', 'id', 'level', 'proposal_url', 'review_url',
      'speaker', 'speaker_confirmation', 'status', 'submitted_at', 'title', 'topic', 'updated_at', 'version'].sort());
    assert.deepEqual(Object.keys(p.speaker).sort(), ['bio', 'country', 'country_code', 'email', 'first_name', 'headshot_source', 'id', 'job_title',
      'last_name', 'linkedin_profile_url', 'name', 'organization', 'photo_url'].sort());
    assert.deepEqual(Object.keys(p.conference).sort(), ['cfp_closes', 'cfp_opens', 'date_precision', 'end_date', 'id', 'location', 'name', 'slug',
      'start_date', 'url'].sort());
    assert.equal(p.status, 'under review');
    assert.equal(p.speaker_confirmation, null);
    assert.equal(p.proposal_url, `http://cfp.test/proposals/${p.id}`);
    assert.deepEqual(p.speaker, {
      id: adaId, name: 'Ada Lovelace', first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com', job_title: 'Mathematician',
      organization: 'Analytical Engines', bio: 'First programmer.', linkedin_profile_url: 'https://www.linkedin.com/in/ada',
      country: 'United Kingdom', country_code: 'GB', photo_url: null, headshot_source: 'linkedin',
    });
    assert.deepEqual(p.conference, {
      id: conf.id, name: 'Events Conf 2027', slug: 'events-conf-2027', location: 'Paris', start_date: '2027-06-10', end_date: '2027-06-11',
      date_precision: 'day', cfp_opens: null, cfp_closes: null, url: 'http://cfp.test/cfp/events-conf-2027',
    });
    const month = (await payloads.conferencePayloadByIdOrSlug(other.slug))!;
    assert.equal(month.date_precision, 'month');
    assert.equal(month.start_date, '2027-09-01');
    assert.equal(month.end_date, null);
  });

  test('an accepted proposal the speaker has not been told about shows as under review, with no internal notes', async () => {
    const r = await submit(graceId, [conf], { title: 'Compilers', abstract: 'A.', [`format_${conf.id}`]: 'Talk (25 min)', [`topic_${conf.id}`]: 'AI' });
    let p = (await props.getProposal(r.ids[0]))!;
    await props.decide(p, adminId, 'accepted', { internal_notes: 'Strong yes, keynote material', feedback_to_speaker: 'Welcome aboard' });
    await props.saveReview(p.id, rex, 5, 'accept', 'Brilliant');
    p = (await props.getProposal(p.id))!;
    await props.updateBySpeaker(p, graceId, { title: 'Compilers for everyone', abstract: 'A.', level: '', co_speakers: '', notes: '', format: p.format, topic: p.topic });
    const ev = (await eventsOfType('proposal.updated')).at(-1)!;
    assert.equal(ev.data.proposal.status, 'under review');
    const text = JSON.stringify(ev.data);
    for (const secret of ['Strong yes', 'Welcome aboard', 'Brilliant', 'internal_notes', 'feedback_to_speaker', 'score']) {
      assert.ok(!text.includes(secret), `payload must not contain ${secret}`);
    }
    assert.deepEqual(ev.data.changed_fields, ['title']);
  });
});

describe('recording events', () => {
  test('an event recorded in a rolled-back transaction leaves no event or delivery rows', async () => {
    const ep = await hooks.createEndpoint({ name: 'Rollback check', url: 'https://example.com/hook', event_types: ['proposal.submitted'] }, adminId);
    const before = await one<{ e: number; d: number }>('SELECT (SELECT COUNT(*) FROM events) AS e, (SELECT COUNT(*) FROM webhook_deliveries) AS d');
    await assert.rejects(transaction(async (db) => {
      await events.recordEvent(db, 'proposal.submitted', { proposal: { id: 0 } });
      throw new Error('change not saved');
    }));
    const afterRows = await one<{ e: number; d: number }>('SELECT (SELECT COUNT(*) FROM events) AS e, (SELECT COUNT(*) FROM webhook_deliveries) AS d');
    assert.deepEqual(afterRows, before);
    await hooks.deleteEndpoint(ep.id!);
  });

  test('a failed submission records nothing', async () => {
    const n = (await query('SELECT id FROM events')).length;
    const r = await submit(adaId, [conf], { title: '', abstract: '' });
    assert.ok(r.errors.length);
    assert.equal((await query('SELECT id FROM events')).length, n);
  });

  test('registration and profile saves record speaker events; unchanged saves record nothing', async () => {
    const reg = await eventsOfType('speaker.registered');
    assert.deepEqual(reg.map((e) => e.data.speaker.email), ['ada@example.com', 'grace@example.com', 'rex@example.com'], 'the first account (organiser) is not announced');
    const before = (await eventsOfType('speaker.profile_updated')).length;
    const values = users.readProfile(form({ first_name: 'Grace', last_name: 'Hopper', bio: 'Admiral.', country: 'US' })).values;
    assert.deepEqual(await users.saveProfile(graceId, values), ['bio', 'country']);
    assert.deepEqual(await users.saveProfile(graceId, values), []);
    const evs = await eventsOfType('speaker.profile_updated');
    assert.equal(evs.length, before + 1);
    assert.deepEqual(evs.at(-1)!.data.changed_fields, ['bio', 'country']);
    assert.equal(evs.at(-1)!.data.speaker.bio, 'Admiral.');
    assert.equal(evs.at(-1)!.data.speaker.country, 'United States');
  });

  test('proposal events: one submitted per conference, updated only on change, withdrawn, confirmed, declined', async () => {
    const before = (await eventsOfType('proposal.submitted')).length;
    const r = await submit(adaId, [conf, other], { title: 'Twice', abstract: 'Two events.', [`format_${conf.id}`]: 'Talk (25 min)', [`topic_${conf.id}`]: 'AI', [`format_${other.id}`]: 'Panel (25 min)' });
    const submitted = await eventsOfType('proposal.submitted');
    assert.equal(submitted.length, before + 2);
    assert.deepEqual(submitted.slice(-2).map((e) => e.data.proposal.id).sort(), [...r.ids].sort());
    assert.deepEqual(submitted.slice(-2).map((e) => e.data.proposal.conference.slug).sort(), [conf.slug, other.slug].sort());

    const updatedBefore = (await eventsOfType('proposal.updated')).length;
    let p = (await props.getProposal(r.ids[0]))!;
    const same = { title: p.title, abstract: p.abstract, level: p.level, co_speakers: p.co_speakers, notes: p.notes, format: p.format, topic: p.topic };
    assert.deepEqual(await props.updateBySpeaker(p, adaId, same), []);
    assert.equal((await eventsOfType('proposal.updated')).length, updatedBefore);
    await props.updateBySpeaker(p, adaId, { ...same, abstract: 'Two events, one talk.' });
    assert.equal((await eventsOfType('proposal.updated')).length, updatedBefore + 1);

    await props.withdraw((await props.getProposal(r.ids[1]))!, adaId);
    assert.equal((await eventsOfType('proposal.withdrawn')).at(-1)!.data.proposal.status, 'withdrawn');

    p = (await props.getProposal(r.ids[0]))!;
    await props.decide(p, adminId, 'accepted', {});
    await confs.setConferenceFlag(conf.id, 'decisions_published', true);
    await props.confirmSlot((await props.getProposal(p.id))!, adaId, 'confirmed');
    const confirmed = (await eventsOfType('proposal.speaker_confirmed')).at(-1)!;
    assert.equal(confirmed.data.proposal.status, 'accepted');
    assert.equal(confirmed.data.proposal.speaker_confirmation, 'confirmed');
    await props.confirmSlot((await props.getProposal(p.id))!, adaId, 'declined');
    assert.equal((await eventsOfType('proposal.speaker_declined')).at(-1)!.data.proposal.speaker_confirmation, 'declined');
    await confs.setConferenceFlag(conf.id, 'decisions_published', false);
  });

  test('deliveries are queued for subscribed endpoints, paused ones included, and not for others', async () => {
    const a = await hooks.createEndpoint({ name: 'A', url: 'https://example.com/a', event_types: ['speaker.registered'] }, adminId);
    const b = await hooks.createEndpoint({ name: 'B', url: 'https://example.com/b', event_types: ['proposal.submitted'] }, adminId);
    await hooks.setPaused(a.id!, true);
    await users.register({ first_name: 'Linus', last_name: 'T', email: 'linus@example.com', organization: '' }, 'password123');
    const ev = (await eventsOfType('speaker.registered')).at(-1)!;
    const rows = await query<{ endpoint_id: number }>('SELECT endpoint_id FROM webhook_deliveries WHERE event_id = $1', [ev.id]);
    assert.deepEqual(rows.map((r) => r.endpoint_id), [a.id]);
    await hooks.deleteEndpoint(a.id!);
    await hooks.deleteEndpoint(b.id!);
    assert.equal((await query('SELECT id FROM webhook_deliveries WHERE event_id = $1', [ev.id])).length, 0, 'deleting an endpoint deletes its deliveries');
  });
});

describe('webhook delivery', () => {
  const rx = receiver();
  let url: string;
  before(async () => { url = await rx.start(); });
  after(() => rx.stop());
  beforeEach(async () => {
    rx.received.length = 0;
    rx.setResponse(() => 200);
    await query('DELETE FROM webhook_endpoints');
  });

  const due = () => query(`UPDATE webhook_deliveries SET next_attempt_at = now() WHERE status = 'pending'`);

  test('deliveries are signed so the receiver can verify them', async () => {
    const ep = await hooks.createEndpoint({ name: 'n8n test', url, event_types: [...events.EVENT_TYPES] }, adminId);
    await events.sendTestEvent(ep.id!);
    assert.equal(await hooks.deliverDue(), 1);
    assert.equal(rx.received.length, 1);
    const { headers, body } = rx.received[0];
    const expected = `sha256=${crypto.createHmac('sha256', ep.secret!).update(`${headers['x-fost-timestamp']}.${body}`).digest('hex')}`;
    assert.equal(headers['x-fost-signature'], expected);
    const envelope = JSON.parse(body);
    assert.deepEqual(Object.keys(envelope).sort(), ['data', 'id', 'occurred_at', 'type', 'version']);
    assert.equal(envelope.type, 'test.ping');
    assert.equal(envelope.version, 1);
    assert.equal(headers['x-fost-event-id'], envelope.id);
    assert.equal(headers['x-fost-event-type'], 'test.ping');
    assert.match(envelope.occurred_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    const [log] = await hooks.deliveryLog(ep.id!);
    assert.equal(log.status, 'delivered');
    assert.equal(log.last_response_status, 200);

    const fresh = await hooks.regenerateSecret(ep.id!);
    await hooks.resendDelivery(ep.id!, log.id);
    await hooks.deliverDue();
    const second = rx.received[1];
    assert.equal(JSON.parse(second.body).id, envelope.id, 'a resend keeps the event id');
    assert.equal(second.headers['x-fost-signature'],
      `sha256=${crypto.createHmac('sha256', fresh).update(`${second.headers['x-fost-timestamp']}.${second.body}`).digest('hex')}`);
  });

  test('a failing endpoint is retried with the same event id and delivered once it recovers', async () => {
    const ep = await hooks.createEndpoint({ name: 'Flaky', url, event_types: ['speaker.profile_updated'] }, adminId);
    rx.setResponse(() => 503);
    await users.saveProfile(adaId, users.readProfile(form({ first_name: 'Ada', last_name: 'Lovelace', job_title: 'Countess' })).values);
    await hooks.deliverDue();
    let [log] = await hooks.deliveryLog(ep.id!);
    assert.equal(log.status, 'pending');
    assert.equal(log.attempts, 1);
    assert.equal(log.last_response_status, 503);
    const wait = Date.parse(log.next_attempt_at!) - Date.now();
    assert.ok(wait > 50_000 && wait <= 61_000, `first retry about a minute later (got ${wait} ms)`);
    assert.equal(await hooks.deliverDue(), 0, 'not retried before it is due');
    rx.setResponse(() => 204);
    await due();
    await hooks.deliverDue();
    [log] = await hooks.deliveryLog(ep.id!);
    assert.equal(log.status, 'delivered');
    assert.equal(log.attempts, 2);
    assert.equal(JSON.parse(rx.received[0].body).id, JSON.parse(rx.received[1].body).id);
  });

  test('a delivery is marked failed after the last retry, about two days later', async () => {
    assert.equal(hooks.MAX_ATTEMPTS, 9);
    const total = hooks.RETRY_DELAYS_MS.reduce((a, b) => a + b, 0);
    assert.ok(total >= 24 * 3_600_000, 'retries span at least 24 hours');
    const ep = await hooks.createEndpoint({ name: 'Down', url, event_types: ['proposal.withdrawn'] }, adminId);
    rx.setResponse(() => 500);
    await events.sendTestEvent(ep.id!);
    for (let i = 0; i < hooks.MAX_ATTEMPTS; i += 1) { await due(); await hooks.deliverDue(); }
    const [log] = await hooks.deliveryLog(ep.id!);
    assert.equal(log.status, 'failed');
    assert.equal(log.attempts, 9);
    assert.equal(log.next_attempt_at, null);
  });

  test('redirects and timeouts count as failures', async () => {
    rx.setResponse(() => 302);
    const r = await hooks.post(url, {}, '{}', false);
    assert.deepEqual(r, { ok: false, status: 302, error: 'HTTP 302' });
  });

  test('a paused endpoint keeps its events and gets them when resumed', async () => {
    const ep = await hooks.createEndpoint({ name: 'Paused', url, event_types: ['speaker.profile_updated'] }, adminId);
    await hooks.setPaused(ep.id!, true);
    await users.saveProfile(graceId, users.readProfile(form({ first_name: 'Grace', last_name: 'Hopper', bio: 'Rear admiral.', country: 'US' })).values);
    assert.equal(await hooks.deliverDue(), 0);
    assert.equal(rx.received.length, 0);
    await hooks.setPaused(ep.id!, false);
    assert.equal(await hooks.deliverDue(), 1);
    assert.equal(JSON.parse(rx.received[0].body).data.speaker.bio, 'Rear admiral.');
  });

  test('two workers running together deliver each event once', async () => {
    await hooks.createEndpoint({ name: 'Busy', url, event_types: ['speaker.profile_updated'] }, adminId);
    rx.setResponse(() => 200);
    for (let i = 0; i < 25; i += 1) {
      await users.saveProfile(adaId, users.readProfile(form({ first_name: 'Ada', last_name: 'Lovelace', job_title: `Role ${i}` })).values);
    }
    const controller = new AbortController();
    const workers = [runWorker({ signal: controller.signal, pollMs: 50, batch: 3 }), runWorker({ signal: controller.signal, pollMs: 50, batch: 3 })];
    const deadline = Date.now() + 10_000;
    while (rx.received.length < 25 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 300));
    controller.abort();
    await Promise.all(workers);
    const ids = rx.received.map((r) => JSON.parse(r.body).id);
    assert.equal(ids.length, 25);
    assert.equal(new Set(ids).size, 25);
    assert.ok(await hooks.lastHeartbeat(), 'the worker records a heartbeat');
  });

  test('the 30-day purge keeps pending events and the slim log rows', async () => {
    const ep = await hooks.createEndpoint({ name: 'Old', url, event_types: ['speaker.profile_updated'] }, adminId);
    const old = await events.sendTestEvent(ep.id!);
    const pending = await events.sendTestEvent(ep.id!);
    await query(`UPDATE events SET occurred_at = now() - interval '31 days' WHERE id = ANY($1)`, [[old, pending]]);
    await query(`UPDATE webhook_deliveries SET status = 'delivered' WHERE event_id = $1`, [old]);
    await hooks.purgeOldPayloads();
    assert.equal((await events.getEvent(old))!.data, null);
    assert.ok((await events.getEvent(pending))!.data);
    const log = await hooks.deliveryLog(ep.id!);
    assert.equal(log.find((l) => l.event_id === old)!.can_resend, false);
    assert.equal(await hooks.resendDelivery(ep.id!, log.find((l) => l.event_id === old)!.id), false);
  });
});

describe('endpoint rules and the SSRF guard', () => {
  test('URLs must be https, except localhost', () => {
    const base = { name: 'X', event_types: ['proposal.submitted'] };
    assert.match(hooks.validateEndpoint({ ...base, url: 'http://n8n.example.com/webhook' })[0], /must start with https/);
    assert.deepEqual(hooks.validateEndpoint({ ...base, url: 'https://n8n.example.com/webhook' }), []);
    assert.deepEqual(hooks.validateEndpoint({ ...base, url: 'http://localhost:5678/webhook' }), []);
    assert.match(hooks.validateEndpoint({ ...base, url: 'ftp://x' })[0], /full webhook URL/);
    assert.match(hooks.validateEndpoint({ name: '', url: 'https://x.io', event_types: [] }).join(' '), /name.*at least one event/);
    assert.match(hooks.validateEndpoint({ ...base, url: 'https://x.io', event_types: ['nope'] }).join(' '), /Unknown event/);
  });

  test('private, loopback and link-local addresses are refused in production', async () => {
    for (const a of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '0.0.0.0', '100.64.0.1']) {
      assert.equal(hooks.isPrivateAddress(a), true, a);
    }
    for (const a of ['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(hooks.isPrivateAddress(a), false, a);
    const ip = await hooks.post('http://169.254.169.254/latest/meta-data', {}, '{}', true);
    assert.equal(ip.ok, false);
    assert.match(ip.error!, /private address/);
    const name = await hooks.post('http://localhost:9/hook', {}, '{}', true);
    assert.equal(name.ok, false);
    assert.match(name.error!, /private address/);
    assert.equal(hooks.ssrfGuardOn(), false, 'off outside production so a local n8n works');
  });
});

describe('integration API', () => {
  let readKey: string;
  let writeKey: string;
  let revokedKey: string;
  let revokedId: number;
  before(async () => {
    readKey = (await keys.createApiKey('n8n production', 'read', adminId)).key!;
    writeKey = (await keys.createApiKey('n8n writer', 'read-write', adminId)).key!;
    const r = await keys.createApiKey('old', 'read', adminId);
    revokedKey = r.key!;
    revokedId = r.id!;
    await keys.revokeApiKey(revokedId);
  });
  beforeEach(() => keys.resetRateLimits());

  test('keys are stored as hashes, shown once, and revocable', async () => {
    assert.match(readKey, /^fost_live_[0-9a-f]{8}_/);
    const stored = await query<{ key_hash: string; prefix: string }>('SELECT key_hash, prefix FROM api_keys');
    assert.ok(stored.every((k) => !k.key_hash.includes(readKey) && readKey.startsWith(k.prefix) === (k.prefix === readKey.slice(0, 18))));
    assert.ok(!JSON.stringify(await keys.listApiKeys()).includes('key_hash'));
    assert.match((await keys.createApiKey('', 'admin', adminId)).errors.join(' '), /name.*what the key may do/);
    assert.equal((await api('GET', '/api/v1/conferences', revokedKey)).status, 401);
    const used = await one<{ last_used_at: string | null }>('SELECT last_used_at FROM api_keys WHERE prefix = $1', [readKey.slice(0, 18)]);
    assert.equal(used!.last_used_at, null);
    await api('GET', '/api/v1/conferences', readKey);
    assert.ok((await one<{ last_used_at: string | null }>('SELECT last_used_at FROM api_keys WHERE prefix = $1', [readKey.slice(0, 18)]))!.last_used_at);
  });

  test('authentication, scopes and JSON errors', async () => {
    let r = await api('GET', '/api/v1/conferences', null);
    assert.equal(r.status, 401);
    assert.equal(r.body.error.code, 'unauthorized');
    assert.match(r.body.error.message, /API key is required/);
    assert.equal((await api('GET', '/api/v1/conferences', 'fost_live_00000000_nope')).status, 401);
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      r = await api(m, '/api/v1/proposals', readKey);
      assert.equal(r.status, 403, m);
      assert.equal(r.body.error.code, 'forbidden');
    }
    assert.equal((await api('POST', '/api/v1/proposals', writeKey)).status, 405);
    r = await api('GET', '/api/v1/proposals/999999', readKey, { id: '999999' });
    assert.equal(r.status, 404);
    assert.deepEqual(Object.keys(r.body), ['error']);
    assert.equal(r.body.error.code, 'not_found');
    assert.equal((await api('GET', '/api/v1/nothing/here', readKey, { path: 'nothing/here' })).status, 404);
    assert.equal((await api('GET', '/api/v1/proposals?updated_since=yesterday', readKey)).status, 400);
    assert.equal((await api('GET', '/api/v1/proposals?cursor=bad', readKey)).status, 400);
  });

  test('reads have the same shape as event payloads', async () => {
    const ev = (await eventsOfType('proposal.submitted')).at(-1)!;
    const r = await api('GET', `/api/v1/proposals/${ev.data.proposal.id}`, readKey, { id: String(ev.data.proposal.id) });
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body).sort(), Object.keys(ev.data.proposal).sort());
    assert.deepEqual(Object.keys(r.body.speaker).sort(), Object.keys(ev.data.proposal.speaker).sort());
    const s = await api('GET', `/api/v1/speakers/${adaId}`, readKey, { id: String(adaId) });
    assert.equal(s.body.email, 'ada@example.com');
    assert.deepEqual(Object.keys(s.body).sort(), Object.keys(ev.data.proposal.speaker).sort());
    const bySlug = await api('GET', `/api/v1/conferences/${conf.slug}`, readKey, { conference: conf.slug });
    assert.equal(bySlug.body.id, conf.id);
    const committee = await api('GET', `/api/v1/conferences/${conf.id}/committee`, readKey, { conference: String(conf.id) });
    assert.deepEqual(committee.body, { items: [{ id: rex, name: 'Rex Reviewer', email: 'rex@example.com' }], next_cursor: null });
    const list = await api('GET', '/api/v1/conferences', readKey);
    assert.deepEqual(list.body.items.map((c: { slug: string }) => c.slug), [conf.slug, other.slug]);
  });

  test('proposal lists filter and page through every item exactly once', async () => {
    const all = await query<{ id: number }>('SELECT id FROM proposals');
    const seen: number[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const r: any = await api('GET', `/api/v1/proposals?limit=2${cursor ? `&cursor=${cursor}` : ''}`, readKey);
      assert.equal(r.status, 200);
      assert.ok(r.body.items.length <= 2);
      seen.push(...r.body.items.map((p: { id: number }) => p.id));
      cursor = r.body.next_cursor;
      pages += 1;
    } while (cursor && pages < 50);
    assert.equal(seen.length, all.length);
    assert.equal(new Set(seen).size, all.length);

    const accepted = await api('GET', `/api/v1/proposals?status=accepted&conference=${conf.slug}`, readKey);
    assert.equal(accepted.body.items.length, 0, 'decisions are hidden, so nothing shows as accepted');
    const review = await api('GET', `/api/v1/proposals?status=${encodeURIComponent('under review')}&conference=${conf.id}`, readKey);
    assert.ok(review.body.items.length > 0);
    assert.ok(review.body.items.every((p: any) => p.status === 'under review' && p.conference.id === conf.id));

    const since = new Date(Date.now() + 60_000).toISOString();
    assert.deepEqual((await api('GET', `/api/v1/proposals?updated_since=${since}`, readKey)).body, { items: [], next_cursor: null });
    assert.equal((await api('GET', '/api/v1/proposals?limit=101', readKey)).status, 400);
  });

  test('600 requests per minute per key, then 429 with Retry-After', async () => {
    const id = (await one<{ id: number }>('SELECT id FROM api_keys WHERE prefix = $1', [readKey.slice(0, 18)]))!.id;
    for (let i = 0; i < 599; i += 1) keys.rateLimit(id);
    assert.equal((await api('GET', '/api/v1/conferences', readKey)).status, 200);
    const r = await api('GET', '/api/v1/conferences', readKey);
    assert.equal(r.status, 429);
    assert.equal(r.body.error.code, 'rate_limited');
    assert.ok(Number(r.headers.get('retry-after')) >= 1);
    assert.equal((await api('GET', '/api/v1/conferences', writeKey)).status, 200, 'limits are per key');
  });

  test('export links are unchanged and separate from API keys', async () => {
    const token = await ensureSecret('export_token');
    const get = (t: string, file: string) => exportRoute.GET(new NextRequest(`http://cfp.test/api/export/${t}/${file}`),
      { params: Promise.resolve({ token: t, file }) });
    const csv = await get(token, 'submissions.csv');
    assert.equal(csv.status, 200);
    const header = (await csv.text()).split(/\r?\n/)[0].replace(/^﻿/, '');
    // The submissions columns as they were before this change, in order.
    assert.equal(header, ['proposal_id', 'conference', 'conference_slug', 'title', 'format', 'topic', 'level', 'abstract', 'co_speakers',
      'notes_to_committee', 'status', 'decisions_published', 'speaker_confirmation', 'feedback_to_speaker', 'internal_notes', 'speaker_id',
      'speaker_name', 'speaker_first_name', 'speaker_last_name', 'speaker_email', 'speaker_organization', 'speaker_job_title', 'speaker_phone',
      'speaker_country', 'speaker_country_code', 'speaker_linkedin_profile_url', 'speaker_photo_url', 'speaker_bio', 'review_count',
      'average_score', 'votes_accept', 'votes_maybe', 'votes_reject', 'version', 'submitted_at', 'updated_at', 'decided_at', 'confirmed_at',
      'speaker_headshot_source', 'proposal_url', 'review_url'].join(','));
    assert.equal((await get(readKey, 'submissions.csv')).status, 401, 'an API key does not open export links');
    assert.equal((await api('GET', '/api/v1/conferences', token)).status, 401, 'the export token is not an API key');
  });
});

// Emailed links: password resets, committee invites, accounts without a password, the organiser
// fallback and the email_link.requested event. Runs against TEST_DATABASE_URL (wiped every run).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://fost:fost@localhost:5432/fost_cfp_test';
process.env.BASE_URL = 'http://cfp.test';

const { closePool, one, pool, query } = await import('../src/lib/db');
const { migrate } = await import('../src/lib/migrate');
const { createSession, login, userForSession } = await import('../src/lib/auth');
const users = await import('../src/lib/users');
const confs = await import('../src/lib/conferences');
const links = await import('../src/lib/email-links');
const hooks = await import('../src/lib/webhooks');
const events = await import('../src/lib/events');

const tokenOf = (url: string) => url.split('/link/')[1];
const linkEvents = () => query<{ data: any }>(`SELECT data FROM events WHERE type = 'email_link.requested' ORDER BY occurred_at, id`);

let adminId: number;
let adaId: number;
let confId: number;

before(async () => {
  await pool().query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool());
  adminId = (await users.register({ first_name: 'Olive', last_name: 'Organiser', email: 'admin@example.com', organization: '' }, 'password123')).user!.id;
  adaId = (await users.register({ first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com', organization: '' }, 'password123')).user!.id;
  const { values } = confs.readConferenceForm((() => { const f = new FormData(); f.set('name', 'Links Conf 2027'); return f; })());
  confId = (await confs.saveConference(values)).id!;
});
after(() => closePool());

describe('password reset links', () => {
  test('forgot password issues a link for known emails only, with an event for n8n', async () => {
    assert.equal(await links.requestPasswordReset('nobody@example.com'), false);
    assert.equal((await linkEvents()).length, 0);
    assert.equal(await links.requestPasswordReset('ADA@example.com'), true);
    const [ev] = await linkEvents();
    assert.equal(ev.data.purpose, 'password_reset');
    assert.deepEqual(ev.data.recipient, { id: adaId, name: 'Ada Lovelace', first_name: 'Ada', email: 'ada@example.com' });
    assert.equal(ev.data.conference, null);
    assert.match(ev.data.url, /^http:\/\/cfp\.test\/link\/[\w-]{43}$/);
    const hoursLeft = (Date.parse(ev.data.expires_at) - Date.now()) / 3_600_000;
    assert.ok(hoursLeft > 23.9 && hoursLeft <= 24, `lasts 24 hours (got ${hoursLeft})`);
    const stored = await query<{ token_hash: string }>('SELECT token_hash FROM email_links');
    assert.ok(stored.every((r) => /^[0-9a-f]{64}$/.test(r.token_hash) && !ev.data.url.includes(r.token_hash)), 'only a hash is stored');
  });

  test('a link is single-use, signs the person in and signs out their other sessions', async () => {
    const old = await createSession(adaId);
    const { url } = await one<{ url: string }>(`SELECT data->>'url' AS url FROM events WHERE type = 'email_link.requested' ORDER BY occurred_at DESC LIMIT 1`) as { url: string };
    const token = tokenOf(url);
    assert.equal((await links.lookupLink(token)).state, 'valid');
    assert.equal((await links.lookupLink(token)).state, 'valid', 'looking at a link does not use it up');
    assert.match((await links.setPasswordWithLink(token, 'short')).error!, /at least 8/);
    const r = await links.setPasswordWithLink(token, 'brand-new-pass');
    assert.equal(r.user?.id, adaId);
    assert.equal(await userForSession(old.token), null, 'other sessions signed out');
    assert.ok(await login('ada@example.com', 'brand-new-pass'));
    assert.equal(await login('ada@example.com', 'password123'), null);
    assert.equal((await links.lookupLink(token)).state, 'used');
    assert.match((await links.setPasswordWithLink(token, 'another-pass')).error!, /already been used/);
  });

  test('expired links and older links stop working', async () => {
    await links.requestPasswordReset('ada@example.com');
    const first = tokenOf((await linkEvents()).at(-1)!.data.url);
    await links.requestPasswordReset('ada@example.com');
    const second = tokenOf((await linkEvents()).at(-1)!.data.url);
    assert.equal((await links.lookupLink(first)).state, 'used', 'superseded by the newer link');
    assert.equal((await links.lookupLink(second)).state, 'valid');
    await query(`UPDATE email_links SET expires_at = now() - interval '1 minute' WHERE used_at IS NULL`);
    assert.equal((await links.lookupLink(second)).state, 'expired');
    assert.match((await links.setPasswordWithLink(second, 'brand-new-pass')).error!, /expired/);
    assert.equal((await links.lookupLink('not-a-real-token-at-all-xxxx')).state, 'invalid');
  });

  test('at most 3 forgot-password links per email per hour', async () => {
    await query('DELETE FROM email_links');
    const results = [];
    for (let i = 0; i < 4; i += 1) results.push(await links.requestPasswordReset('ada@example.com'));
    assert.deepEqual(results, [true, true, true, false]);
    await query(`UPDATE email_links SET created_at = now() - interval '61 minutes'`);
    assert.equal(await links.requestPasswordReset('ada@example.com'), true, 'allowed again an hour later');
  });
});

describe('committee invites and accounts without a password', () => {
  test('inviting someone without an account creates a password-less reviewer and emails an invite', async () => {
    assert.deepEqual(await confs.addReviewer(confId, 'jo@example.com'), { needsName: true });
    assert.equal(await one('SELECT id FROM users WHERE email = $1', ['jo@example.com']), null, 'nothing created without a name');
    const r = await confs.addReviewer(confId, 'Jo@Example.com', { first_name: 'Jo', last_name: 'Bloggs' });
    assert.deepEqual(r, { name: 'Jo Bloggs', invited: true });
    const jo = (await one<{ id: number; role: string; password_hash: string }>('SELECT id, role, password_hash FROM users WHERE email = $1', ['jo@example.com']))!;
    assert.equal(jo.role, 'reviewer');
    assert.equal(jo.password_hash, '');
    assert.deepEqual((await confs.committee(confId)).map((m) => m.email), ['jo@example.com']);
    const ev = (await linkEvents()).at(-1)!.data;
    assert.equal(ev.purpose, 'committee_invite');
    assert.deepEqual(ev.conference, { name: 'Links Conf 2027', slug: 'links-conf-2027' });
    const days = (Date.parse(ev.expires_at) - Date.now()) / 86_400_000;
    assert.ok(days > 6.99 && days <= 7, 'invites last 7 days');
    assert.equal((await query(`SELECT id FROM events WHERE type = 'speaker.registered' AND data->'speaker'->>'email' = 'jo@example.com'`)).length, 0);

    for (const pw of ['', 'password123', 'anything']) assert.equal(await login('jo@example.com', pw), null, 'cannot sign in without a password');
    const done = await links.setPasswordWithLink(tokenOf(ev.url), 'reviewing-now');
    assert.equal(done.purpose, 'committee_invite');
    assert.ok(await login('jo@example.com', 'reviewing-now'));
  });

  test('adding someone who already has an account issues no link', async () => {
    const before = (await linkEvents()).length;
    assert.deepEqual(await confs.addReviewer(confId, 'ada@example.com'), { name: 'Ada Lovelace' });
    assert.equal((await linkEvents()).length, before);
    assert.match((await confs.addReviewer(confId, 'not-an-email')).error!, /valid email/);
  });

  test('an account without a password can set one through forgot password', async () => {
    await confs.addReviewer(confId, 'sam@example.com', { first_name: 'Sam', last_name: 'Lost' });
    assert.equal(await links.requestPasswordReset('sam@example.com'), true);
    const ev = (await linkEvents()).at(-1)!.data;
    assert.equal(ev.purpose, 'password_reset');
    await links.setPasswordWithLink(tokenOf(ev.url), 'found-it-again');
    assert.ok(await login('sam@example.com', 'found-it-again'));
  });
});

describe('organiser fallback', () => {
  test('a copied link works like a reset link but sends no email', async () => {
    const before = (await linkEvents()).length;
    const url = (await links.copyPasswordLink(adaId, adminId))!;
    assert.equal((await linkEvents()).length, before, 'no email_link.requested event');
    const row = (await one<{ created_by: number; purpose: string }>('SELECT created_by, purpose FROM email_links ORDER BY id DESC LIMIT 1'))!;
    assert.deepEqual(row, { created_by: adminId, purpose: 'password_reset' });
    await links.setPasswordWithLink(tokenOf(url), 'copied-link-pass');
    assert.ok(await login('ada@example.com', 'copied-link-pass'));
    assert.equal(await links.copyPasswordLink(999999, adminId), null);
  });
});

describe('the email_link.requested event', () => {
  test('existing endpoints keep their events; only endpoints that tick it receive links', async () => {
    const before = await hooks.createEndpoint({ name: 'Old', url: 'https://example.com/old', event_types: [...events.EVENT_TYPES].filter((t) => t !== 'email_link.requested') }, adminId);
    const ticked = await hooks.createEndpoint({ name: 'Emails', url: 'https://example.com/emails', event_types: ['email_link.requested'] }, adminId);
    await query('DELETE FROM email_links');
    await links.requestPasswordReset('ada@example.com');
    const ev = await one<{ id: string }>(`SELECT id FROM events WHERE type = 'email_link.requested' ORDER BY occurred_at DESC, id DESC LIMIT 1`);
    const got = await query<{ endpoint_id: number }>('SELECT endpoint_id FROM webhook_deliveries WHERE event_id = $1', [ev!.id]);
    assert.deepEqual(got.map((g) => g.endpoint_id), [ticked.id]);
    assert.ok(before.id);
  });
});

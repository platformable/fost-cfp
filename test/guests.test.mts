// Guest submissions: awaiting confirmation, invisible until confirmed, confirming, claiming,
// anti-bot rules and expiry. Runs against TEST_DATABASE_URL (wiped every run).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Conference } from '../src/lib/conferences';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://fost:fost@localhost:5432/fost_cfp_test';
process.env.BASE_URL = 'http://cfp.test';

const { closePool, one, pool, query } = await import('../src/lib/db');
const { migrate } = await import('../src/lib/migrate');
const { login } = await import('../src/lib/auth');
const users = await import('../src/lib/users');
const confs = await import('../src/lib/conferences');
const props = await import('../src/lib/proposals');
const guests = await import('../src/lib/guests');
const links = await import('../src/lib/email-links');
const payloads = await import('../src/lib/payloads');
const exp = await import('../src/lib/export');
const keys = await import('../src/lib/api-keys');
const v1 = await import('../src/lib/api-v1');

const form = (data: Record<string, string | number | (string | number)[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(data)) for (const item of [].concat(v as never)) f.append(k, String(item));
  return f;
};
async function newConference(name: string) {
  const { values } = confs.readConferenceForm(form({ name }));
  return (await confs.getConference((await confs.saveConference(values)).id!))!;
}
const guestSubmit = (email: string, conferences: Conference[], title = 'A guest talk') => {
  const common = props.readCommon(form({ title, abstract: 'An abstract.' })).values;
  return guests.submitAsGuest({ first_name: 'Gus', last_name: 'Guest', email, organization: 'Guestworks' }, common,
    conferences.map((conf) => ({ conf, pick: { format: 'Talk (25 min)', topic: '' } })));
};
const lastLink = async (purpose: string) => (await one<{ data: any }>(`SELECT data FROM events WHERE type = 'email_link.requested'
  AND data->>'purpose' = $1 ORDER BY occurred_at DESC, id DESC LIMIT 1`, [purpose]))!.data;
const tokenOf = (url: string) => url.split('/link/')[1];
const eventsOf = (type: string) => query<{ data: any }>('SELECT data FROM events WHERE type = $1 ORDER BY occurred_at, id', [type]);

let adminId: number;
let conf: Conference;
let other: Conference;
let readKey: string;

before(async () => {
  await pool().query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool());
  adminId = (await users.register({ first_name: 'Olive', last_name: 'Organiser', email: 'admin@example.com', organization: '' }, 'password123')).user!.id;
  await users.register({ first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com', organization: '' }, 'password123');
  conf = await newConference('Guest Conf 2027');
  other = await newConference('Other Conf 2027');
  readKey = (await keys.createApiKey('n8n', 'read', adminId)).key!;
});
after(() => closePool());

const apiGet = async (path: string, handler: Parameters<typeof v1.v1>[0], params: Record<string, string> = {}) => {
  const res = await v1.v1(handler).GET(new Request(`http://cfp.test${path}`, { headers: { Authorization: `Bearer ${readKey}` } }), { params: Promise.resolve(params) });
  return { status: res.status, body: await res.json() };
};

describe('a guest submission awaits confirmation', () => {
  let ids: number[];

  test('two conferences, one confirmation link listing both, no proposal events', async () => {
    const r = await guestSubmit('gus@example.com', [conf, other]);
    assert.equal(r.status, 'sent');
    ids = r.ids;
    assert.equal(ids.length, 2);
    const gus = (await one<{ password_hash: string; role: string; first_name: string }>('SELECT password_hash, role, first_name FROM users WHERE email = $1', ['gus@example.com']))!;
    assert.deepEqual(gus, { password_hash: '', role: 'speaker', first_name: 'Gus' });
    const link = await lastLink('confirm_proposal');
    assert.deepEqual(link.proposals, [{ title: 'A guest talk', conference: 'Guest Conf 2027' }, { title: 'A guest talk', conference: 'Other Conf 2027' }]);
    const months = (Date.parse(link.expires_at) - Date.now()) / (30.4 * 86_400_000);
    assert.ok(months > 5.9 && months < 6.1, `link lasts about 6 months (got ${months})`);
    assert.equal((await eventsOf('proposal.submitted')).length, 0);
    assert.equal((await eventsOf('speaker.registered')).filter((e) => e.data.speaker.email === 'gus@example.com').length, 0);
  });

  test('unconfirmed proposals are invisible everywhere except the organiser count', async () => {
    const admin = (await one<any>('SELECT * FROM users WHERE id = $1', [adminId]))!;
    const filter = { status: '', topic: '', todo: false, sort: 'newest' as const };
    assert.equal((await props.reviewList(conf, admin, filter)).length, 0, 'committee list');
    assert.deepEqual(await props.statusCounts(conf.id), {}, 'status counts');
    assert.equal((await confs.conferenceStats(conf.id)).total, 0, 'conference stats');
    assert.equal(await props.getProposal(ids[0]), null, 'proposal page');
    const gusId = (await one<{ id: number }>('SELECT id FROM users WHERE email = $1', ['gus@example.com']))!.id;
    assert.equal((await props.speakerProposals(gusId)).length, 0, "speaker's own list");
    assert.deepEqual(await props.neighbours(conf.id, ids[0]), { prevId: null, nextId: null });
    for (const [name, dataset] of Object.entries(exp.DATASETS)) {
      const rows = await dataset({});
      const text = JSON.stringify(rows);
      if (name === 'conferences') assert.ok(rows.every((r) => r.proposals_total === 0), 'conferences export counts');
      else assert.ok(!text.includes('A guest talk') && !text.includes('gus@example.com'), `${name} export`);
    }
    assert.equal((await payloads.listProposalPayloads({ limit: 100 })).items.length, 0, 'payload list');
    assert.equal(await payloads.proposalPayloadById(ids[0]), null);
    assert.equal((await apiGet('/api/v1/proposals', v1.listProposals)).body.items.length, 0, 'API list');
    assert.equal((await apiGet(`/api/v1/proposals/${ids[0]}`, v1.getProposal, { id: String(ids[0]) })).status, 404, 'API item');
    assert.deepEqual(await guests.awaitingCounts(), { [conf.id]: 1, [other.id]: 1 });
    assert.equal((await props.bulkDecide(conf.id, ids, 'accepted', adminId)), 0, 'cannot be decided');
  });

  test('confirming counts them, records the events and keeps the submission time', async () => {
    const before = await query<{ id: number; submitted_at: string }>('SELECT id, submitted_at FROM proposals WHERE id = ANY($1) ORDER BY id', [ids]);
    const link = await lastLink('confirm_proposal');
    const r = await guests.confirmWithLink(tokenOf(link.url));
    assert.deepEqual(r.confirmed, [...ids].sort((a, b) => a - b));
    assert.equal(r.passwordSet, false);
    const after = await query<{ id: number; submitted_at: string }>('SELECT id, submitted_at FROM proposals WHERE id = ANY($1) ORDER BY id', [ids]);
    assert.deepEqual(after, before);
    const submitted = await eventsOf('proposal.submitted');
    assert.deepEqual(submitted.map((e) => e.data.proposal.id).sort(), [...ids].sort());
    assert.ok(submitted.every((e) => e.data.proposal.speaker.account_status === 'guest'));
    const reg = (await eventsOf('speaker.registered')).filter((e) => e.data.speaker.email === 'gus@example.com');
    assert.equal(reg.length, 1);
    assert.equal(reg[0].data.speaker.account_status, 'guest');
    assert.equal((await confs.conferenceStats(conf.id)).total, 1);
    assert.ok(await props.getProposal(ids[0]));
    const speakersRow = (await exp.DATASETS.speakers({})).find((r) => r.email === 'gus@example.com')!;
    assert.equal(speakersRow.account_status, 'guest');
    assert.deepEqual(Object.keys(speakersRow).slice(-2), ['account_status', 'mc_interest'], 'added after the existing columns');
    assert.match((await guests.confirmWithLink(tokenOf(link.url))).error!, /already been used/);
  });

  test('a guest cannot sign in until they claim the account', async () => {
    for (const pw of ['', 'password123']) assert.equal(await login('gus@example.com', pw), null);
  });
});

describe('claiming and existing accounts', () => {
  test('forgot password sends a guest a claim link (7 days)', async () => {
    assert.equal(await links.requestPasswordReset('gus@example.com'), true);
    const link = await lastLink('claim_account');
    const days = (Date.parse(link.expires_at) - Date.now()) / 86_400_000;
    assert.ok(days > 6.99 && days <= 7);
    await links.setPasswordWithLink(tokenOf(link.url), 'gus-has-a-password');
    assert.ok(await login('gus@example.com', 'gus-has-a-password'));
  });

  test('registering with a guest email sends a claim link instead of creating an account', async () => {
    await guestSubmit('reg@example.com', [conf]);
    const r = await users.register({ first_name: 'Reg', last_name: 'X', email: 'reg@example.com', organization: '' }, 'password123');
    assert.deepEqual(r, { claimSent: true });
    assert.equal((await query('SELECT id FROM users WHERE email = $1', ['reg@example.com'])).length, 1);
    assert.equal((await lastLink('claim_account')).recipient.email, 'reg@example.com');
    assert.equal(await login('reg@example.com', 'password123'), null, 'registering did not set a password');
    const taken = await users.register({ first_name: 'A', last_name: 'B', email: 'ada@example.com', organization: '' }, 'password123');
    assert.match(taken.error!, /already exists/, 'accounts with a password keep today\'s message');
  });

  test('confirming with a password claims the account at the same time', async () => {
    await guestSubmit('pia@example.com', [conf]);
    const link = await lastLink('confirm_proposal');
    assert.match((await guests.confirmWithLink(tokenOf(link.url), 'short')).error!, /at least 8/);
    const r = await guests.confirmWithLink(tokenOf(link.url), 'pia-password');
    assert.equal(r.passwordSet, true);
    assert.ok(await login('pia@example.com', 'pia-password'));
    assert.equal((await eventsOf('proposal.submitted')).at(-1)!.data.proposal.speaker.account_status, 'active');
  });

  test("a guest proposal with an existing account's email joins that account once confirmed", async () => {
    const ada = (await one<{ id: number; first_name: string }>('SELECT id, first_name FROM users WHERE email = $1', ['ada@example.com']))!;
    const r = await guests.submitAsGuest({ first_name: 'Not', last_name: 'Ada', email: 'ADA@example.com', organization: 'X' },
      props.readCommon(form({ title: 'Ada as guest', abstract: 'A.' })).values, [{ conf, pick: { format: 'Talk (25 min)', topic: '' } }]);
    assert.equal(r.status, 'sent');
    assert.equal((await one<{ first_name: string }>('SELECT first_name FROM users WHERE id = $1', [ada.id]))!.first_name, 'Ada', 'details not overwritten');
    assert.equal((await props.speakerProposals(ada.id)).length, 0);
    const regBefore = (await eventsOf('speaker.registered')).length;
    await guests.confirmWithLink(tokenOf((await lastLink('confirm_proposal')).url));
    assert.deepEqual((await props.speakerProposals(ada.id)).map((p) => p.title), ['Ada as guest']);
    assert.equal((await eventsOf('speaker.registered')).length, regBefore, 'not a new speaker');
  });

  test('an older confirmation link still confirms everything awaiting', async () => {
    await guestSubmit('two@example.com', [conf], 'First');
    const first = await lastLink('confirm_proposal');
    await guestSubmit('two@example.com', [other], 'Second');
    const second = await lastLink('confirm_proposal');
    assert.notEqual(first.url, second.url);
    assert.equal(second.proposals.length, 2, 'the newest email lists everything awaiting');
    const r = await guests.confirmWithLink(tokenOf(first.url));
    assert.equal(r.confirmed!.length, 2);
    assert.equal((await one<{ n: number }>(`SELECT COUNT(*) AS n FROM proposals p JOIN users u ON u.id = p.speaker_id
      WHERE u.email = 'two@example.com' AND p.awaiting_confirmation`))!.n, 0);
  });
});

describe('anti-bot check and limits', () => {
  test('hidden field, forged or too-fast form times are bots; a normal form is not', async () => {
    const now = Date.now();
    const token = await guests.formToken(now - 10_000);
    assert.equal(await guests.looksLikeBot(form({ form_started: token }), now), false);
    assert.equal(await guests.looksLikeBot(form({ form_started: token, website: 'http://spam' }), now), true, 'honeypot');
    assert.equal(await guests.looksLikeBot(form({ form_started: await guests.formToken(now - 1000) }), now), true, 'under 3 seconds');
    const [ts] = token.split('.');
    assert.equal(await guests.looksLikeBot(form({ form_started: `${ts}.${'0'.repeat(64)}` }), now), true, 'forged');
    assert.equal(await guests.looksLikeBot(form({}), now), true, 'missing');
  });

  test('at most 5 proposals awaiting confirmation per email', async () => {
    assert.equal((await guestSubmit('busy@example.com', [conf, other])).status, 'sent');
    assert.equal((await guestSubmit('busy@example.com', [conf, other])).status, 'sent');
    assert.equal((await guestSubmit('busy@example.com', [conf])).status, 'sent');
    assert.deepEqual(await guestSubmit('busy@example.com', [other]), { status: 'too_many', ids: [] });
    assert.equal((await one<{ n: number }>(`SELECT COUNT(*) AS n FROM proposals p JOIN users u ON u.id = p.speaker_id WHERE u.email = 'busy@example.com'`))!.n, 5);
  });

  test('guest details are required', () => {
    const { errors } = guests.readGuest(form({ guest_first_name: '', guest_email: 'nope' }));
    assert.equal(errors.length, 2);
  });
});

describe('expiry', () => {
  test('unconfirmed proposals and empty guest accounts are deleted after 6 months', async () => {
    await guestSubmit('old@example.com', [conf]);
    const oldId = (await one<{ id: number }>('SELECT id FROM users WHERE email = $1', ['old@example.com']))!.id;
    await query(`UPDATE proposals SET submitted_at = now() - interval '6 months 1 day' WHERE speaker_id = $1`, [oldId]);
    await query(`UPDATE users SET created_at = now() - interval '6 months 1 day' WHERE id = $1`, [oldId]);
    await query(`UPDATE email_links SET expires_at = now() - interval '1 minute' WHERE user_id = $1`, [oldId]);
    const busyBefore = (await one<{ n: number }>(`SELECT COUNT(*) AS n FROM proposals WHERE awaiting_confirmation`))!.n;
    const r = await guests.purgeExpiredGuests();
    assert.deepEqual(r, { proposals: 1, accounts: 1 });
    assert.equal(await one('SELECT id FROM users WHERE id = $1', [oldId]), null);
    assert.equal((await one<{ n: number }>(`SELECT COUNT(*) AS n FROM proposals WHERE awaiting_confirmation`))!.n, busyBefore - 1, 'recent ones kept');
    assert.ok(await one(`SELECT id FROM users WHERE email = 'gus@example.com'`), 'confirmed guests kept');
  });
});

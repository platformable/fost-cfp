// Importing proposals from Typeform, the profile fields it fills, topic exceptions, the live sync
// API and claim emails. Runs against TEST_DATABASE_URL (wiped every run).
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://fost:fost@localhost:5432/fost_cfp_test';
process.env.BASE_URL = 'http://cfp.test';

const { closePool, one, pool, query, transaction } = await import('../src/lib/db');
const { migrate } = await import('../src/lib/migrate');
const users = await import('../src/lib/users');
const confs = await import('../src/lib/conferences');
const props = await import('../src/lib/proposals');
const imp = await import('../src/lib/imports');
const payloads = await import('../src/lib/payloads');
const exp = await import('../src/lib/export');
const hooks = await import('../src/lib/webhooks');
const events = await import('../src/lib/events');
const keys = await import('../src/lib/api-keys');
const v1 = await import('../src/lib/api-v1');

const SAMPLE = fs.readFileSync(new URL('./fixtures/typeform-sample.csv', import.meta.url), 'utf8');
const form = (data: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(data)) f.append(k, v); return f; };
async function newConference(name: string, topics = '') {
  const { values } = confs.readConferenceForm(form({ name, topics }));
  return (await confs.getConference((await confs.saveConference(values)).id!))!;
}
const eventsOf = (type: string) => query<{ data: any }>('SELECT data FROM events WHERE type = $1 ORDER BY occurred_at, id', [type]);

let adminId: number;
let london: Awaited<ReturnType<typeof newConference>>;
let amsterdam: Awaited<ReturnType<typeof newConference>>;
let singapore: Awaited<ReturnType<typeof newConference>>;
let map: Record<string, number | null>;

before(async () => {
  await pool().query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool());
  adminId = (await users.register({ first_name: 'Olive', last_name: 'Organiser', email: 'admin@example.com', organization: '' }, 'password123')).user!.id;
  london = await newConference('apidays London 2027', 'OpenAPI\nAPI Security');
  amsterdam = await newConference('apidays Amsterdam 2027', 'GreenIO\nAI Collective');
  singapore = await newConference('apidays Singapore 2027', 'Payments');
  const { conferenceLabels } = imp.readTypeformExport(SAMPLE);
  map = Object.fromEntries(conferenceLabels.map((l) => [l, null]));
  map['apidays London 2027'] = london.id;
  map['apidays Amsterdam 2027'] = amsterdam.id;
  map['apidays Singapore 2027'] = singapore.id;
});
after(() => closePool());

describe('reading a Typeform export', () => {
  test('semicolons, multi-line abstracts, conference and topic columns found by position', () => {
    const { responses, conferenceLabels, errors } = imp.readTypeformExport(SAMPLE);
    assert.deepEqual(errors, []);
    assert.equal(conferenceLabels.length, 12);
    assert.equal(conferenceLabels[0], 'apidays Paris 2026 (Dec 1-3)');
    assert.equal(responses.length, 2);
    const [craig, elspeth] = responses;
    assert.equal(craig.response_id, 'ctvltejen2afm1fctvlte6t9dh910k5t');
    assert.equal(craig.conferences.length, 6);
    assert.equal(elspeth.conferences.length, 12);
    assert.deepEqual(craig.topics, ['OpenAPI', 'GreenIO', 'VoiceAI']);
    assert.match(craig.abstract, /^As AI-powered applications/);
    assert.ok(craig.abstract.includes('\n\nPublic APIs offer'), 'line breaks inside quotes kept');
    assert.equal(craig.email, 'craig.salm@example.com');
    assert.equal(craig.submitted_at, '2026-11-07T10:30:11Z');
    assert.equal(craig.mc, true);
    assert.equal(elspeth.mc, false);
    assert.equal(elspeth.gender, 'Fermale');
    assert.equal(craig.terms_accepted, true);
    assert.equal(craig.level, 'Beginner');
  });

  test('countries and genders are mapped', () => {
    assert.equal(imp.countryCode('France, Metropolitan'), 'FR');
    assert.equal(imp.countryCode('Malaysia'), 'MY');
    assert.equal(imp.countryCode('United States of America'), 'US');
    assert.equal(imp.countryCode('Atlantis'), '');
    assert.deepEqual(imp.genderAnswer('Fermale'), { gender: 'Female', matched: true });
    assert.deepEqual(imp.genderAnswer('male'), { gender: 'Male', matched: true });
    assert.deepEqual(imp.genderAnswer('', 'non-binary'), { gender: 'Other', matched: true });
    assert.deepEqual(imp.genderAnswer('Prefer not to say'), { gender: 'Prefer not to say', matched: true });
    assert.deepEqual(imp.genderAnswer('xyz'), { gender: 'Other', matched: false });
    assert.deepEqual(imp.genderAnswer(''), { gender: null, matched: true });
  });

  test('a file that is not the CFP export is refused', () => {
    assert.match(imp.readTypeformExport('a;b\n1;2').errors[0], /doesn't look like the Typeform CFP export/);
  });
});

describe('importing a file', () => {
  let batchId: number;

  test('the preview counts without saving anything', async () => {
    batchId = await imp.createBatch('sample.csv', SAMPLE, adminId);
    const p = await imp.previewImport(SAMPLE, map);
    assert.equal(p.responses, 2);
    assert.equal(p.proposals, 5, 'Craig: London + Amsterdam; Elspeth: London + Amsterdam + Singapore');
    assert.equal(p.newSpeakers, 2);
    assert.deepEqual([...p.exceptionsByConference].sort((a, b) => a.conference.localeCompare(b.conference)), [{ conference: 'apidays London 2027', count: 1 }, { conference: 'apidays Singapore 2027', count: 1 }]);
    assert.deepEqual(p.unmatchedCountries, []);
    assert.equal((await query('SELECT id FROM proposals')).length, 0);
  });

  test('a column without a choice blocks the import', async () => {
    const partial = { ...map };
    delete partial['apidays Munich 2027'];
    assert.match((await imp.runBatch(batchId, partial)).error!, /apidays Munich 2027/);
  });

  test('importing creates guests, one proposal per mapped conference, and only proposal.imported', async () => {
    const r = await imp.runBatch(batchId, map);
    assert.deepEqual(r.counts, { responses: 2, proposals: 5, topic_exceptions: 2, new_speakers: 2, already_imported: 0, skipped: 0 });
    const craig = (await one<any>(`SELECT * FROM users WHERE email = 'craig.salm@example.com'`))!;
    assert.equal(craig.password_hash, '', 'guest');
    assert.equal(craig.role, 'speaker');
    assert.equal(craig.organization, 'Example Labs');
    assert.equal(craig.country, 'FR');
    assert.equal(craig.linkedin_profile_url, 'https://www.linkedin.com/in/craig-salm-example/');
    assert.equal(craig.gender, 'Male');
    assert.equal(craig.mc_interest, true);
    const elspeth = (await one<any>(`SELECT * FROM users WHERE email = 'elspeth@example.org'`))!;
    assert.equal(elspeth.gender, 'Female', '"Fermale" mapped');
    assert.equal(elspeth.mc_interest, false);
    assert.equal(elspeth.linkedin_profile_url, 'https://www.linkedin.com/in/elspeth-abbas-example', 'http made https');

    const ps = await query<any>('SELECT * FROM proposals ORDER BY id');
    assert.equal(ps.length, 5);
    assert.ok(ps.every((p) => p.format === 'Talk (25 min)' && p.source === 'typeform_import' && !p.awaiting_confirmation && p.status === 'submitted'));
    const craigLondon = ps.find((p) => p.speaker_id === craig.id && p.conference_id === london.id);
    assert.equal(craigLondon.topic, 'OpenAPI');
    assert.equal(craigLondon.submitted_at, '2026-11-07T10:30:11Z');
    assert.equal(craigLondon.source_ref, 'ctvltejen2afm1fctvlte6t9dh910k5t');
    assert.deepEqual(craigLondon.source_details.topics_ticked, ['OpenAPI', 'GreenIO', 'VoiceAI']);
    assert.equal(ps.find((p) => p.speaker_id === craig.id && p.conference_id === amsterdam.id).topic, 'GreenIO');
    const elspethLondon = ps.find((p) => p.speaker_id === elspeth.id && p.conference_id === london.id);
    assert.equal(elspethLondon.topic, '');
    assert.equal(elspethLondon.topic_exception, true);
    assert.equal(ps.find((p) => p.speaker_id === elspeth.id && p.conference_id === amsterdam.id).topic, 'GreenIO');

    assert.equal((await eventsOf('proposal.imported')).length, 5);
    for (const t of ['proposal.submitted', 'speaker.registered', 'email_link.requested']) assert.equal((await eventsOf(t)).length, 0, t);
    const ev = (await eventsOf('proposal.imported'))[0].data;
    assert.equal(ev.typeform.response_id.length > 10, true);
    assert.equal(ev.proposal.speaker.account_status, 'guest');
    assert.equal(typeof ev.proposal.speaker.mc_interest, 'boolean');
    assert.ok(!JSON.stringify(ev).toLowerCase().includes('gender') && !JSON.stringify(ev).includes('Fermale'), 'no gender in the payload');
    assert.equal((await imp.getBatch(batchId))!.content, null, 'file content cleared');
  });

  test('imported proposals already count: committee list and exports', async () => {
    const admin = (await one<any>('SELECT * FROM users WHERE id = $1', [adminId]))!;
    const list = await props.reviewList(london, admin, { status: '', topic: '', todo: false, sort: 'newest' });
    assert.equal(list.length, 2);
    const rows = await exp.DATASETS.submissions({});
    assert.equal(rows.length, 5);
    assert.deepEqual(Object.keys(rows[0]).slice(-2), ['source', 'speaker_mc_interest']);
    assert.equal(rows[0].source, 'typeform_import');
    const text = JSON.stringify(await Promise.all(Object.values(exp.DATASETS).map((d) => d({}))));
    assert.ok(!text.includes('Fermale') && !/"gender"/.test(text), 'no gender in any export');
  });

  test('importing the same file again adds nothing', async () => {
    const again = await imp.createBatch('sample-again.csv', SAMPLE, adminId);
    const r = await imp.runBatch(again, map);
    assert.equal(r.counts!.already_imported, 2);
    assert.equal(r.counts!.proposals, 0);
    assert.equal((await query('SELECT id FROM proposals')).length, 5);
    assert.equal((await eventsOf('proposal.imported')).length, 5);
  });
});

describe('topic exceptions', () => {
  test('organisers choose a topic, add the speaker\'s topic, or leave none', async () => {
    const list = await imp.topicExceptions();
    assert.equal(list.length, 2);
    const londonEx = list.find((e) => e.conference_id === london.id)!;
    assert.deepEqual(londonEx.topics_ticked, ['GreenIO', 'Hacking APIs', 'VoiceAI', 'AI Collective']);
    assert.match((await imp.resolveTopicException(londonEx.id, { kind: 'use', topic: 'Not a topic' }, adminId))!, /conference's topics/);
    assert.equal(await imp.resolveTopicException(londonEx.id, { kind: 'add', topic: 'Hacking APIs' }, adminId), null);
    assert.ok((await confs.getConference(london.id))!.topicList.includes('Hacking APIs'), 'added to the conference');
    assert.equal((await one<any>('SELECT topic, topic_exception FROM proposals WHERE id = $1', [londonEx.id]))!.topic, 'Hacking APIs');
    const sg = list.find((e) => e.conference_id === singapore.id)!;
    assert.equal(await imp.resolveTopicException(sg.id, { kind: 'none' }, adminId), null);
    assert.equal((await imp.topicExceptions()).length, 0);
    assert.match((await imp.resolveTopicException(sg.id, { kind: 'none' }, adminId))!, /no longer needs/);
  });

  test('a conference with no topic list never makes an exception', async () => {
    const noTopics = await newConference('No Topics Conf');
    const r = imp.readTypeformExport(SAMPLE).responses[0];
    const res = await transaction((db) => imp.importResponse(db, { ...r, response_id: 'no-topics-1', conferences: ['No Topics Conf'] }, { 'No Topics Conf': noTopics.id }, 'typeform_import'));
    assert.equal(res.topic_exceptions.length, 0);
    assert.equal((await one<any>('SELECT topic, topic_exception FROM proposals WHERE id = $1', [res.proposals[0]]))!.topic_exception, false);
  });
});

describe('existing accounts and the profile fields', () => {
  test("an existing speaker's details are kept; empty ones are filled", async () => {
    const ada = (await users.register({ first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com', organization: 'Engines Ltd' }, 'password123')).user!;
    const r = { ...imp.readTypeformExport(SAMPLE).responses[0], response_id: 'ada-1', email: 'ADA@example.com', first_name: 'Not', company: 'Other Co', gender: 'Female' };
    await transaction((db) => imp.importResponse(db, r, map, 'typeform_import'));
    const after = (await one<any>('SELECT * FROM users WHERE id = $1', [ada.id]))!;
    assert.equal(after.first_name, 'Ada');
    assert.equal(after.organization, 'Engines Ltd');
    assert.equal(after.job_title, 'CEO', 'empty field filled');
    assert.equal(after.gender, 'Female');
    assert.notEqual(after.password_hash, '', 'still a full account');
  });

  test('gender is private; MC interest is announced and exported', async () => {
    const ada = (await one<{ id: number }>(`SELECT id FROM users WHERE email = 'ada@example.com'`))!;
    const base = { first_name: 'Ada', last_name: 'Lovelace' };
    const before = (await eventsOf('speaker.profile_updated')).length;
    let v = users.readProfile(form({ ...base, organization: 'Engines Ltd', job_title: 'CEO', gender: 'Prefer not to say', mc_interest: '' })).values;
    // Only the gender (and job title already equal) changes: saved, but no event.
    const fresh = (await one<any>('SELECT * FROM users WHERE id = $1', [ada.id]))!;
    v = { ...v, linkedin_profile_url: fresh.linkedin_profile_url, country: fresh.country, bio: fresh.bio, phone: fresh.phone, photo_url: fresh.photo_url, mc_interest: fresh.mc_interest };
    assert.deepEqual(await users.saveProfile(ada.id, v), []);
    assert.equal((await one<any>('SELECT gender FROM users WHERE id = $1', [ada.id]))!.gender, 'Prefer not to say');
    assert.equal((await eventsOf('speaker.profile_updated')).length, before, 'gender-only change records nothing');
    assert.equal(fresh.mc_interest, true, 'imported from the Typeform answer');
    assert.deepEqual(await users.saveProfile(ada.id, { ...v, mc_interest: false }), ['mc_interest']);
    const ev = (await eventsOf('speaker.profile_updated')).at(-1)!.data;
    assert.equal(ev.speaker.mc_interest, false);
    assert.ok(!JSON.stringify(ev).includes('Prefer not to say'));
    assert.match(users.readProfile(form({ ...base, gender: 'Robot' })).error!, /from the list/);
    const speakersRow = (await exp.DATASETS.speakers({})).find((r) => r.email === 'ada@example.com')!;
    assert.equal(speakersRow.mc_interest, 'no');
    assert.equal(Object.keys(speakersRow).at(-1), 'mc_interest');
  });

  test("a reviewer's view of a proposal has no gender", async () => {
    const p = (await one<{ id: number }>(`SELECT p.id FROM proposals p JOIN users u ON u.id = p.speaker_id WHERE u.email = 'ada@example.com'`))!;
    const detail = await props.getProposal(p.id);
    assert.ok(!('gender' in detail!) && !('speaker_gender' in detail!));
    const payload = await payloads.proposalPayloadById(p.id);
    assert.ok(!('gender' in payload!.speaker));
    assert.deepEqual(await users.speakerOrganiserDetails((await one<{ id: number }>(`SELECT id FROM users WHERE email = 'ada@example.com'`))!.id),
      { gender: 'Prefer not to say', mc_interest: false });
  });
});

describe('the live sync API', () => {
  let rw: string;
  let ro: string;
  before(async () => {
    rw = (await keys.createApiKey('n8n Typeform sync', 'read-write', adminId)).key!;
    ro = (await keys.createApiKey('reader', 'read', adminId)).key!;
    await imp.saveConferenceMap(map);
  });
  beforeEach(() => keys.resetRateLimits());
  const routes = v1.typeformImportRoute();
  const post = async (key: string, body: unknown, method: 'POST' | 'GET' = 'POST') => {
    const res = await routes[method](new Request('http://cfp.test/api/v1/imports/typeform', {
      method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined,
    }));
    return { status: res.status, body: await res.json() };
  };
  const body = {
    response_id: 'sync-001', submitted_at: '2026-11-20T09:00:00Z', conferences: ['apidays London 2027', 'apidays Paris 2026 (Dec 1-3)'],
    topics: ['API Security'], first_name: 'Sam', last_name: 'Sync', email: 'sam@example.com', job_title: 'CTO', company: 'Sync Co',
    linkedin: 'linkedin.com/in/sam-sync', based_in: 'Germany', title: 'Syncing safely', abstract: 'A talk.', level: 'Advanced',
    gender: 'female', gender_other: '', mc: true, terms_accepted: true,
  };

  test('a new response is imported (201), and a repeat adds nothing', async () => {
    let r = await post(rw, body);
    assert.equal(r.status, 201);
    assert.equal(r.body.proposals.length, 1);
    assert.deepEqual(r.body.topic_exceptions, []);
    const p = (await one<any>('SELECT * FROM proposals WHERE id = $1', [r.body.proposals[0]]))!;
    assert.equal(p.source, 'typeform_sync');
    assert.equal(p.topic, 'API Security');
    r = await post(rw, body);
    assert.equal(r.status, 200);
    assert.equal(r.body.already_imported, true);
    assert.equal((await query(`SELECT id FROM proposals WHERE source_ref = 'sync-001'`)).length, 1);
  });

  test('only skipped conferences, unmapped labels, bad bodies and read keys', async () => {
    let r = await post(rw, { ...body, response_id: 'sync-002', conferences: ['apidays Paris 2026 (Dec 1-3)'] });
    assert.deepEqual(r, { status: 200, body: { skipped: 'no mapped conferences', unmapped: [] } });
    r = await post(rw, { ...body, response_id: 'sync-003', conferences: ['apidays Tokyo 2027'] });
    assert.deepEqual(r.body.unmapped, ['apidays Tokyo 2027']);
    r = await post(rw, { ...body, response_id: 'sync-004', email: '' });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'invalid_request');
    r = await post(ro, { ...body, response_id: 'sync-005' });
    assert.equal(r.status, 403);
    assert.equal((await post(rw, null, 'GET')).status, 405);
    assert.equal((await query(`SELECT id FROM proposals WHERE source_ref IN ('sync-002','sync-003','sync-004','sync-005')`)).length, 0);
  });
});

describe('visa approvals and claim emails', () => {
  test('a decision told before the app is recorded once', async () => {
    const p = (await one<any>(`SELECT * FROM proposals WHERE source = 'typeform_import' ORDER BY id LIMIT 1`))!;
    await props.decide(p, adminId, 'accepted', {});
    assert.equal(await imp.recordToldBeforeImport(p.id, adminId), true);
    assert.equal(await imp.recordToldBeforeImport(p.id, adminId), false);
    assert.deepEqual((await props.history(p.id, ['decision told before import'])).map((h) => h.detail), ['Status at the time: accepted']);
  });

  test('claim emails: one 30-day link per unclaimed imported guest, no repeats unless asked', async () => {
    const counts = await imp.claimEmailCounts();
    assert.equal(counts.unclaimed, 3, 'Craig, Elspeth and Sam (Ada has a password)');
    assert.equal(counts.alreadySent, 0);
    assert.equal(await imp.sendClaimEmails(adminId, false), 3);
    const sent = (await eventsOf('email_link.requested')).filter((e) => e.data.purpose === 'claim_account');
    assert.equal(sent.length, 3);
    const days = (Date.parse(sent[0].data.expires_at) - Date.now()) / 86_400_000;
    assert.ok(days > 29.9 && days <= 30);
    assert.equal(await imp.sendClaimEmails(adminId, false), 0);
    assert.equal((await imp.claimEmailCounts()).alreadySent, 3);
    assert.equal(await imp.sendClaimEmails(adminId, true), 3);
    // The forgot-password claim link stays at 7 days.
    const links = await import('../src/lib/email-links');
    await query(`DELETE FROM email_links`);
    await links.requestPasswordReset('craig.salm@example.com');
    const last = (await eventsOf('email_link.requested')).at(-1)!.data;
    assert.equal(last.purpose, 'claim_account');
    const d = (Date.parse(last.expires_at) - Date.now()) / 86_400_000;
    assert.ok(d > 6.9 && d <= 7);
  });
});

describe('the proposal.imported event', () => {
  test('existing endpoints do not get it until they tick it', async () => {
    const old = await hooks.createEndpoint({ name: 'Old', url: 'https://example.com/old', event_types: events.EVENT_TYPES.filter((t) => t !== 'proposal.imported') as string[] }, adminId);
    const ticked = await hooks.createEndpoint({ name: 'LinkedIn to-dos', url: 'https://example.com/li', event_types: ['proposal.imported'] }, adminId);
    const r = { ...imp.readTypeformExport(SAMPLE).responses[0], response_id: 'event-1', email: 'event@example.com' };
    const res = await transaction((db) => imp.importResponse(db, r, map, 'typeform_import'));
    const ev = await one<{ id: string }>(`SELECT id FROM events WHERE type = 'proposal.imported' AND data->'typeform'->>'response_id' = 'event-1' LIMIT 1`);
    const deliveries = await query<{ endpoint_id: number }>('SELECT endpoint_id FROM webhook_deliveries WHERE event_id = $1', [ev!.id]);
    assert.deepEqual(deliveries.map((d) => d.endpoint_id), [ticked.id]);
    assert.ok(old.id && res.proposals.length === 2);
  });
});

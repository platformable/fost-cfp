// Integration tests against a real PostgreSQL database (wiped on every run).
// TEST_DATABASE_URL defaults to postgres://fost:fost@localhost:5432/fost_cfp_test
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import type { Conference } from '../src/lib/conferences';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://fost:fost@localhost:5432/fost_cfp_test';
process.env.BASE_URL = 'http://cfp.test';

const { closePool, one, pool, query } = await import('../src/lib/db');
const { migrate } = await import('../src/lib/migrate');
const { createSession, deleteSession, login, userForSession } = await import('../src/lib/auth');
const users = await import('../src/lib/users');
const confs = await import('../src/lib/conferences');
const props = await import('../src/lib/proposals');
const exp = await import('../src/lib/export');

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

before(async () => {
  await pool().query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool());
});
after(() => closePool());

describe('accounts', () => {
  test('first account is the organiser, later ones are speakers; emails are unique', async () => {
    const a = await users.register({ first_name: 'Olive', last_name: 'Organiser', email: 'admin@example.com', organization: '' }, 'password123');
    assert.equal(a.user?.role, 'admin');
    assert.equal(a.user?.name, 'Olive Organiser');
    const s = await users.register({ first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com', organization: 'AE' }, 'password123');
    assert.equal(s.user?.role, 'speaker');
    const dup = await users.register({ first_name: 'X', last_name: '', email: 'ADA@example.com', organization: '' }, 'password123');
    assert.match(dup.error!, /already exists/);
    assert.match((await users.register({ first_name: '', last_name: '', email: 'x@y.z', organization: '' }, 'password123')).error!, /first name/);
    assert.match((await users.register({ first_name: 'X', last_name: '', email: 'x@y.z', organization: '' }, 'short')).error!, /8 characters/);
  });

  test('sign-in and sessions', async () => {
    assert.equal(await login('ada@example.com', 'wrong'), null);
    const ada = await login('Ada@Example.com', 'password123');
    assert.ok(ada);
    const { token } = await createSession(ada.id);
    assert.equal((await userForSession(token))?.email, 'ada@example.com');
    assert.equal(await userForSession('not-a-token'), null);
    await deleteSession(token);
    assert.equal(await userForSession(token), null);
  });

  test('profile: first and last name, LinkedIn URL, country from the list', async () => {
    const bad = users.readProfile(form({ first_name: 'Ada', linkedin_profile_url: 'https://mastodon.social/@ada' }));
    assert.match(bad.error!, /linkedin\.com address/);
    assert.match(users.readProfile(form({ first_name: 'Ada', country: 'Atlantis' })).error!, /country from the list/);
    assert.match(users.readProfile(form({ first_name: '' })).error!, /First name is required/);
    const ok = users.readProfile(form({ first_name: 'Ada', last_name: 'King-Lovelace', linkedin_profile_url: 'linkedin.com/in/ada', country: 'GB' }));
    assert.equal(ok.error, null);
    assert.equal(ok.values.linkedin_profile_url, 'https://linkedin.com/in/ada');
    const ada = (await one<{ id: number }>(`SELECT id FROM users WHERE email = 'ada@example.com'`))!;
    await users.saveProfile(ada.id, ok.values);
    assert.equal((await one<{ name: string }>('SELECT name FROM users WHERE id = $1', [ada.id]))!.name, 'Ada King-Lovelace');
  });
});

describe('proposal lifecycle', () => {
  let conf: Conference;
  let adaId: number;
  let adminId: number;
  let graceId: number;
  let pid: number;

  before(async () => {
    adaId = (await one<{ id: number }>(`SELECT id FROM users WHERE email = 'ada@example.com'`))!.id;
    adminId = (await one<{ id: number }>(`SELECT id FROM users WHERE email = 'admin@example.com'`))!.id;
    graceId = (await users.register({ first_name: 'Grace', last_name: 'Hopper', email: 'grace@example.com', organization: '' }, 'password123')).user!.id;
    conf = await newConference({ name: 'API Conf 2027', description: 'Talks about APIs', start_date: '2027-03-01', end_date: '2027-03-02', topics: 'Design\nSecurity' });
  });

  test('conference settings are validated', async () => {
    assert.equal(conf.slug, 'api-conf-2027');
    assert.deepEqual(conf.topicList, ['Design', 'Security']);
    assert.equal(conf.cfpOpen, true);
    const bad = confs.readConferenceForm(form({ name: '', cfp_opens: '2027-02-01', cfp_closes: '2027-01-01' }));
    assert.deepEqual(bad.errors, ['Name is required.', 'The CFP must close after it opens.']);
    const clash = await confs.saveConference(confs.readConferenceForm(form({ name: 'API Conf 2027' })).values);
    assert.match(clash.errors[0], /already uses that URL slug/);
  });

  test('speakers submit with a required topic; edits bump the version', async () => {
    let r = await submit(adaId, [conf], { title: '', abstract: '', [`format_${conf.id}`]: 'nope' });
    assert.deepEqual(r.errors, ['Title is required.', 'Abstract is required.', 'Please choose a session format.', 'Please choose a topic.']);
    r = await submit(adaId, [conf], { title: 'Designing APIs', abstract: '=HYPERLINK("evil")', level: 'Beginner', [`format_${conf.id}`]: 'Talk (30 min)', [`topic_${conf.id}`]: 'Design' });
    assert.deepEqual(r.errors, []);
    pid = r.ids[0];
    let p = (await props.getProposal(pid))!;
    assert.equal(p.topic, 'Design');
    assert.equal(p.status, 'submitted');

    const changed = await props.updateBySpeaker(p, adaId, { title: 'Designing durable APIs', abstract: p.abstract, level: 'Beginner', co_speakers: '', notes: '', format: 'Talk (30 min)', topic: 'Security' });
    assert.deepEqual(changed, ['title', 'topic']);
    p = (await props.getProposal(pid))!;
    assert.equal(p.version, 2);
    assert.deepEqual((await props.history(pid)).map((h) => h.action), ['edited', 'submitted']);
  });

  test('one proposal can go to several conferences, all or nothing', async () => {
    const a = await newConference({ name: 'Multi A', topics: 'APIs\nAI' });
    const b = await newConference({ name: 'Multi B', formats: 'Keynote\nTalk (20 min)' });
    const data = { title: 'One talk, two events', abstract: 'Same abstract everywhere.', level: 'Advanced', [`format_${a.id}`]: 'Talk (30 min)', [`topic_${a.id}`]: 'AI', [`format_${b.id}`]: 'Talk (30 min)' };
    let r = await submit(adaId, [a, b], data);
    assert.deepEqual(r.errors, ['Please choose a session format for Multi B.']);
    assert.equal((await one<{ n: number }>(`SELECT COUNT(*) AS n FROM proposals WHERE title = 'One talk, two events'`))!.n, 0);
    r = await submit(adaId, [a, b], { ...data, [`format_${b.id}`]: 'Keynote' });
    assert.equal(r.ids.length, 2);
    const rows = await query(`SELECT conference_id, format, topic, level FROM proposals WHERE title = 'One talk, two events' ORDER BY conference_id`);
    assert.deepEqual(rows, [
      { conference_id: a.id, format: 'Talk (30 min)', topic: 'AI', level: 'Advanced' },
      { conference_id: b.id, format: 'Keynote', topic: '', level: 'Advanced' },
    ]);
  });

  test('reviews, decisions, publishing and confirmation', async () => {
    await confs.addReviewer(conf.id, 'grace@example.com');
    const grace = (await one<{ role: string }>('SELECT role FROM users WHERE id = $1', [graceId]))!;
    assert.equal(grace.role, 'reviewer', 'joining a committee makes a speaker a reviewer');
    assert.equal(await confs.isReviewerFor({ id: graceId, role: 'reviewer' } as never, conf.id), true);

    const graceUser = { id: graceId, role: 'reviewer' } as never;
    let list = await props.reviewList(conf, graceUser, { status: '', topic: '', todo: true, sort: 'newest' });
    assert.equal(list.length, 1);
    await props.saveReview(pid, graceId, 4, 'accept', 'Solid');
    await props.saveReview(pid, graceId, 5, 'accept', 'Even better');
    list = await props.reviewList(conf, graceUser, { status: '', topic: '', todo: true, sort: 'newest' });
    assert.equal(list.length, 0, 'reviewed proposals drop off the to-do list');
    list = await props.reviewList(conf, graceUser, { status: '', topic: 'Security', todo: false, sort: 'score' });
    assert.equal(list[0].avg_score, 5);
    assert.equal(list[0].my_score, 5);

    let p = (await props.getProposal(pid))!;
    await props.decide(p, adminId, 'accepted', { feedback_to_speaker: 'Welcome aboard!', internal_notes: '', topic: 'Design' });
    p = (await props.getProposal(pid))!;
    assert.equal(p.status, 'accepted');
    assert.equal(p.topic, 'Design', 'organisers can change the topic');
    assert.ok(p.decided_at);

    let c = (await confs.getConference(conf.id))!;
    assert.equal(props.publicStatus(p, c), 'under review', 'hidden until decisions are published');
    await confs.setConferenceFlag(conf.id, 'decisions_published', true);
    c = (await confs.getConference(conf.id))!;
    assert.equal(props.publicStatus(p, c), 'accepted');

    await props.confirmSlot(p, adaId, 'confirmed');
    p = (await props.getProposal(pid))!;
    assert.equal(p.speaker_confirmation, 'confirmed');

    // Moving away from accepted clears the confirmation.
    assert.equal(await props.bulkDecide(conf.id, [pid], 'waitlisted', adminId), 1);
    p = (await props.getProposal(pid))!;
    assert.equal(p.speaker_confirmation, '');
    await props.decide(p, adminId, 'accepted', {});
    await props.confirmSlot((await props.getProposal(pid))!, adaId, 'confirmed');
  });

  test('spreadsheet exports', async () => {
    const csv = exp.toCsv(await exp.DATASETS.submissions({ conferenceId: conf.id }));
    const [header, row] = csv.trim().split('\r\n');
    assert.match(header, /^proposal_id,conference,conference_slug,title,format,topic,level,abstract/);
    assert.match(row, /Designing durable APIs/);
    assert.match(row, /"'=HYPERLINK\(""evil""\)"/, 'formula injection is neutralised');
    assert.match(row, /,accepted,yes,confirmed,Welcome aboard!,/);

    const [sub] = await exp.DATASETS.submissions({ conferenceId: conf.id });
    assert.equal(sub.speaker_first_name, 'Ada');
    assert.equal(sub.speaker_country, 'United Kingdom');
    assert.equal(sub.speaker_country_code, 'GB');
    assert.equal(sub.speaker_headshot_source, 'linkedin');
    assert.equal(sub.average_score, 5);
    assert.equal(sub.review_count, 1);
    assert.equal(sub.proposal_url, `http://cfp.test/proposals/${pid}`);
    assert.match(String(sub.updated_at), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);

    const program = await exp.DATASETS.program({});
    assert.equal(program.length, 1);
    assert.equal(program[0].speaker_confirmation, 'confirmed');

    assert.deepEqual(await exp.DATASETS.submissions({ updatedSince: '2999-01-01T00:00:00Z' }), []);
    const speakers = await exp.DATASETS.speakers({});
    assert.equal(speakers.find((s) => s.email === 'ada@example.com')?.proposals_accepted, 1);

    const f = await exp.filtersFrom(new URLSearchParams('conference=api-conf-2027&status=accepted&updated_since=nonsense'));
    assert.deepEqual(f, { conferenceId: conf.id, slug: 'api-conf-2027', status: 'accepted' });

    const res = await exp.exportResponse('workbook', 'xlsx', { conferenceId: conf.id, slug: conf.slug });
    assert.match(res.headers.get('content-disposition')!, /api-conf-2027-workbook-/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as never);
    assert.deepEqual(wb.worksheets.map((s) => s.name), ['Submissions', 'Program', 'Speakers', 'Reviews', 'Conferences']);
    const reviews = wb.getWorksheet('Reviews')!;
    const scoreCol = (reviews.getRow(1).values as unknown[]).indexOf('score');
    assert.equal(reviews.getRow(2).getCell(scoreCol).value, 5);
  });

  test('withdrawn proposals cannot be edited; closed calls reject new submissions', async () => {
    const p = (await props.getProposal(pid))!;
    await props.withdraw(p, adaId);
    const c = (await confs.getConference(conf.id))!;
    assert.equal(props.canSpeakerEdit((await props.getProposal(pid))!, c), false);
    const old = await newConference({ name: 'Old Conf', cfp_opens: '2020-01-01', cfp_closes: '2020-02-01' });
    assert.equal(old.cfpState, 'closed');
    assert.equal((await confs.openConferences()).some((x) => x.id === old.id), false);
  });
});

describe('edit window', () => {
  const conf = { start_date: '2027-03-10', archived: false, decisions_published: false };
  const p = { status: 'submitted' as const, speaker_confirmation: '' as const };

  test('runs to the day before the conference, not the CFP close', () => {
    assert.equal(props.editDeadline(conf), '2027-03-09');
    assert.deepEqual(props.editWindow(p, conf, '2027-02-01'), { editable: true, deadline: '2027-03-09', daysLeft: 36, label: '36 days left to edit', tone: 'open' });
    assert.equal(props.editWindow(p, conf, '2027-03-08').label, '1 day left to edit');
    assert.equal(props.editWindow(p, conf, '2027-03-08').tone, 'soon');
    assert.equal(props.editWindow(p, conf, '2027-03-09').label, 'Last day to edit');
    assert.equal(props.editWindow(p, conf, '2027-03-10').label, 'Editing closed');
    assert.equal(props.editWindow(p, { ...conf, start_date: null }, '2030-01-01').label, 'No edit deadline');
  });

  test('hidden decisions do not lock the speaker out', () => {
    assert.equal(props.canSpeakerEdit({ status: 'rejected', speaker_confirmation: '' }, conf, '2027-02-01'), true);
    assert.equal(props.canSpeakerEdit({ status: 'rejected', speaker_confirmation: '' }, { ...conf, decisions_published: true }, '2027-02-01'), false);
    assert.equal(props.canSpeakerEdit({ status: 'accepted', speaker_confirmation: 'declined' }, { ...conf, decisions_published: true }, '2027-02-01'), false);
    assert.equal(props.canSpeakerEdit({ status: 'withdrawn', speaker_confirmation: '' }, conf, '2027-02-01'), false);
  });
});

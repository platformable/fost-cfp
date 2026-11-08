// Importing proposals collected in Typeform: from an exported CSV (with a preview) and one response
// at a time from n8n (POST /api/v1/imports/typeform). Both turn a response into the same shape and
// go through importResponse(), which applies every rule. Imports are silent: they record
// proposal.imported only, never proposal.submitted, speaker.registered or emailed links.
import type pg from 'pg';
import { getSetting, one, query, setSetting, transaction } from './db';
import type { User } from './auth';
import { COUNTRIES, isCountryCode } from './countries';
import { getConference, LEVELS, lines, type Conference } from './conferences';
import { issueLink } from './email-links';
import { recordProposalEvent } from './events';
import { logHistory } from './proposals';
import { GENDERS, normalizeLinkedIn, type Gender } from './users';

// ---------- The normalised response ----------

export interface TypeformResponse {
  response_id: string;
  submitted_at: string; // ISO 8601, UTC
  conferences: string[]; // conference choice labels ticked
  topics: string[]; // topic choice labels ticked, in form order
  first_name: string;
  last_name: string;
  email: string;
  job_title: string;
  company: string;
  linkedin: string;
  based_in: string;
  title: string;
  abstract: string;
  level: string;
  gender: string;
  gender_other: string;
  mc: boolean | null;
  terms_accepted: boolean;
}

export const DEFAULT_IMPORT_FORMAT = 'Talk (25 min)';

// ---------- CSV ----------

// Splits CSV text into rows of cells: quoted cells may hold the delimiter, doubled quotes and line
// breaks. The delimiter is ';' when the header line has more of those than commas.
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.slice(0, src.search(/\r?\n/) >= 0 ? src.search(/\r?\n/) : src.length);
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

const norm = (h: string) => h.replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

// Finds the columns of a Typeform export by its question wording and by position: conference
// choices sit between '#' and the first-name question; topic choices between the audience-level
// question and the MC question. Both groups can grow without code changes.
export function readTypeformExport(text: string): { responses: TypeformResponse[]; conferenceLabels: string[]; errors: string[] } {
  const rows = parseCsv(text);
  const errors: string[] = [];
  if (!rows.length) return { responses: [], conferenceLabels: [], errors: ['The file is empty.'] };
  const header = rows[0].map((h) => h.trim());
  const h = header.map(norm);
  const find = (test: (s: string) => boolean) => h.findIndex(test);
  const col = {
    id: find((s) => s === '#'),
    first: find((s) => s.includes('your first name')),
    last: find((s) => s.includes('your last name')),
    gender: find((s) => s.includes('your gender')),
    job: find((s) => s.includes('job title')),
    company: find((s) => s.includes('company name')),
    email: find((s) => s === 'your email' || s.includes('your email')),
    based: find((s) => s.includes('where are you based')),
    linkedin: find((s) => s.includes('linkedin')),
    title: find((s) => s.includes('title of your talk')),
    abstract: find((s) => s.startsWith('short abstract')),
    level: find((s) => s.includes('level of audience')),
    mc: find((s) => s.includes('master of ceremony') || s.includes('open to being an mc')),
    terms: find((s) => s.includes('before submitting')),
    type: find((s) => s === 'response type'),
    submitted: find((s) => s.startsWith('submit date')),
  };
  for (const [name, i] of Object.entries({ '#': col.id, 'Your first name': col.first, 'Your email': col.email, "What's the title of your talk?": col.title, 'Submit Date (UTC)': col.submitted })) {
    if (i < 0) errors.push(`This doesn't look like the Typeform CFP export: no "${name}" column.`);
  }
  if (errors.length) return { responses: [], conferenceLabels: [], errors };
  const conferenceCols = range(col.id + 1, col.first);
  const topicCols = col.level >= 0 && col.mc > col.level ? range(col.level + 1, col.mc) : [];
  // The gender question's "Other" text box is the column straight after it.
  const genderOther = col.gender >= 0 && h[col.gender + 1] === 'other' ? col.gender + 1 : -1;
  const at = (r: string[], i: number) => (i >= 0 ? String(r[i] ?? '').trim() : '');
  const responses: TypeformResponse[] = [];
  for (const r of rows.slice(1)) {
    if (col.type >= 0 && at(r, col.type) && at(r, col.type) !== 'completed') continue;
    if (!at(r, col.id)) continue;
    responses.push({
      response_id: at(r, col.id),
      submitted_at: typeformDate(at(r, col.submitted)),
      conferences: conferenceCols.filter((i) => at(r, i)).map((i) => header[i]),
      topics: topicCols.map((i) => (h[i] === 'other' ? at(r, i) : at(r, i) ? header[i] : '')).filter(Boolean),
      first_name: at(r, col.first),
      last_name: at(r, col.last),
      email: at(r, col.email).toLowerCase(),
      job_title: at(r, col.job),
      company: at(r, col.company),
      linkedin: at(r, col.linkedin),
      based_in: at(r, col.based),
      title: at(r, col.title),
      abstract: at(r, col.abstract),
      level: at(r, col.level),
      gender: at(r, col.gender),
      gender_other: at(r, genderOther),
      mc: yesNo(at(r, col.mc)),
      terms_accepted: !!at(r, col.terms),
    });
  }
  return { responses, conferenceLabels: conferenceCols.map((i) => header[i]), errors };
}

const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from) }, (_, k) => from + k);
const yesNo = (v: string): boolean | null => (v === '1' || /^(yes|true)$/i.test(v) ? true : v === '0' || /^(no|false)$/i.test(v) ? false : null);

// Typeform writes "2026-11-07 10:30:11" in UTC.
function typeformDate(v: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(:\d{2})?)/.exec(v);
  if (m) return `${m[1]}T${m[2].length === 5 ? `${m[2]}:00` : m[2]}Z`;
  return Number.isNaN(Date.parse(v)) ? '' : new Date(v).toISOString();
}

// ---------- The API body ----------

const STRING_FIELDS = ['first_name', 'last_name', 'email', 'job_title', 'company', 'linkedin', 'based_in', 'title', 'abstract', 'level', 'gender', 'gender_other'] as const;

// Checks the JSON n8n sends. Returns the response, or the problems with it.
export function readApiBody(body: unknown): { response?: TypeformResponse; errors: string[] } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const errors: string[] = [];
  const str = (k: string) => (typeof b[k] === 'string' ? (b[k] as string).trim() : '');
  const list = (k: string) => (Array.isArray(b[k]) ? (b[k] as unknown[]).filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : []);
  if (!str('response_id')) errors.push('response_id is required.');
  if (!str('submitted_at') || Number.isNaN(Date.parse(str('submitted_at')))) errors.push('submitted_at must be an ISO 8601 time.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str('email'))) errors.push('email is required.');
  if (!str('title')) errors.push('title is required.');
  if (errors.length) return { errors };
  const response = Object.fromEntries(STRING_FIELDS.map((k) => [k, str(k)])) as unknown as TypeformResponse;
  response.response_id = str('response_id');
  response.submitted_at = new Date(str('submitted_at')).toISOString();
  response.email = response.email.toLowerCase();
  response.conferences = list('conferences');
  response.topics = list('topics');
  response.mc = typeof b.mc === 'boolean' ? b.mc : null;
  response.terms_accepted = b.terms_accepted === true;
  return { response, errors };
}

// ---------- Mapping answers ----------

const COUNTRY_ALIASES: Record<string, string> = {
  'united states of america': 'US', usa: 'US', 'united states': 'US', uk: 'GB', 'great britain': 'GB', england: 'GB',
  scotland: 'GB', wales: 'GB', 'northern ireland': 'GB', 'south korea': 'KR', 'korea, republic of': 'KR', russia: 'RU',
  'czech republic': 'CZ', 'the netherlands': 'NL', holland: 'NL', vietnam: 'VN', 'hong kong sar': 'HK', uae: 'AE', turkey: 'TR',
};
const BY_NAME = new Map(COUNTRIES.map((c) => [c.name.toLowerCase(), c.code]));

// Typeform's country names to the app's ISO codes ("France, Metropolitan" is France). '' when unknown.
export function countryCode(name: string): string {
  const n = name.trim().toLowerCase();
  if (!n) return '';
  if (n.length === 2 && isCountryCode(n.toUpperCase())) return n.toUpperCase();
  const base = n.replace(/,\s*metropolitan$/, '').replace(/^the /, '');
  return BY_NAME.get(n) ?? BY_NAME.get(base) ?? COUNTRY_ALIASES[n] ?? COUNTRY_ALIASES[base] ?? '';
}

function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

// Typeform's free-text gender to the profile's answers. `matched` is false when it had to guess.
export function genderAnswer(raw: string, other = ''): { gender: Gender | null; matched: boolean } {
  const g = raw.trim().toLowerCase();
  if (!g && !other.trim()) return { gender: null, matched: true };
  if (g === 'female' || editDistance(g, 'female') <= 1) return { gender: 'Female', matched: true };
  if (g === 'male' || editDistance(g, 'male') <= 1) return { gender: 'Male', matched: true };
  if (g.includes('prefer not')) return { gender: 'Prefer not to say', matched: true };
  if (g === 'other' || (!g && other.trim())) return { gender: 'Other', matched: true };
  return { gender: (GENDERS as readonly string[]).includes(raw.trim()) ? (raw.trim() as Gender) : 'Other', matched: false };
}

const levelOf = (v: string) => LEVELS.find((l) => l.toLowerCase() === v.trim().toLowerCase()) ?? '';

// ---------- Conference mapping ----------

export type ConferenceMap = Record<string, number | null>;

export async function conferenceMap(): Promise<ConferenceMap> {
  try {
    return JSON.parse((await getSetting('typeform_conference_map')) ?? '{}') as ConferenceMap;
  } catch {
    return {};
  }
}

export async function saveConferenceMap(map: ConferenceMap): Promise<void> {
  await setSetting('typeform_conference_map', JSON.stringify(map));
}

// ---------- Importing one response ----------

export type ImportSource = 'typeform_import' | 'typeform_sync';

export interface ImportResult {
  proposals: number[];
  topic_exceptions: number[];
  already_imported?: boolean;
  skipped?: 'no mapped conferences';
  unmapped: string[];
  new_speaker: boolean;
}

// Applies every import rule inside the caller's transaction. Safe to call twice for one response.
export async function importResponse(db: pg.PoolClient, r: TypeformResponse, map: ConferenceMap, source: ImportSource): Promise<ImportResult> {
  await query('SELECT pg_advisory_xact_lock(hashtext($1))', [`typeform:${r.response_id}`], db);
  const unmapped = r.conferences.filter((label) => !(label in map));
  const done = await query<{ id: number }>('SELECT id FROM proposals WHERE source_ref = $1 ORDER BY id', [r.response_id], db);
  if (done.length) return { proposals: done.map((d) => d.id), topic_exceptions: [], already_imported: true, unmapped, new_speaker: false };
  const conferenceIds = [...new Set(r.conferences.map((label) => map[label]).filter((id): id is number => typeof id === 'number'))];
  if (!conferenceIds.length) return { proposals: [], topic_exceptions: [], skipped: 'no mapped conferences', unmapped, new_speaker: false };

  const gender = genderAnswer(r.gender, r.gender_other).gender;
  const linkedin = r.linkedin ? normalizeLinkedIn(r.linkedin) ?? '' : '';
  const country = countryCode(r.based_in);
  const email = r.email.trim().toLowerCase();
  // One guest submission or import at a time per email, so two responses can't create two accounts.
  await query('SELECT pg_advisory_xact_lock(hashtext($1))', [`guest:${email}`], db);
  let user = await one<User>('SELECT * FROM users WHERE lower(email) = $1 FOR UPDATE', [email], db);
  const newSpeaker = !user;
  if (!user) {
    user = await one<User>(`INSERT INTO users (email, password_hash, first_name, last_name, organization, job_title,
        linkedin_profile_url, country, gender, mc_interest, role)
      VALUES ($1, '', $2, $3, $4, $5, $6, $7, $8, $9, 'speaker') RETURNING *`,
    [email, r.first_name || email.split('@')[0], r.last_name, r.company, r.job_title, linkedin, country, gender, r.mc], db);
  } else {
    // Existing accounts keep their details; only empty answers are filled in.
    await query(`UPDATE users SET
        organization = CASE WHEN organization = '' THEN $2 ELSE organization END,
        job_title = CASE WHEN job_title = '' THEN $3 ELSE job_title END,
        linkedin_profile_url = CASE WHEN linkedin_profile_url = '' THEN $4 ELSE linkedin_profile_url END,
        country = CASE WHEN country = '' THEN $5 ELSE country END,
        gender = COALESCE(gender, $6),
        mc_interest = COALESCE(mc_interest, $7)
      WHERE id = $1`, [user.id, r.company, r.job_title, linkedin, country, gender, r.mc], db);
  }

  const details = {
    response_id: r.response_id,
    terms_accepted_at: r.terms_accepted ? r.submitted_at : null,
    topics_ticked: r.topics,
    gender_as_written: [r.gender, r.gender_other].filter(Boolean).join(' / '),
  };
  const proposals: number[] = [];
  const exceptions: number[] = [];
  for (const conferenceId of conferenceIds) {
    const conf = (await getConference(conferenceId))!;
    const topic = r.topics.find((t) => conf.topicList.includes(t)) ?? '';
    const exception = conf.topicList.length > 0 && !topic;
    const row = await one<{ id: number }>(`INSERT INTO proposals (conference_id, speaker_id, title, abstract, level, format, topic,
        submitted_at, updated_at, source, source_ref, source_details, topic_exception)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9, $10, $11, $12) RETURNING id`,
    [conferenceId, user!.id, r.title, r.abstract, levelOf(r.level), DEFAULT_IMPORT_FORMAT, topic,
      r.submitted_at || new Date().toISOString(), source, r.response_id, JSON.stringify(details), exception], db);
    await logHistory(db, row!.id, null, 'imported', `From Typeform (response ${r.response_id})${exception ? '; topic needs choosing' : ''}`);
    proposals.push(row!.id);
    if (exception) exceptions.push(row!.id);
  }
  for (const id of proposals) await recordProposalEvent(db, 'proposal.imported', id, { typeform: { response_id: r.response_id } });
  return { proposals, topic_exceptions: exceptions, unmapped, new_speaker: newSpeaker };
}

// The live sync: one response from n8n, using the saved conference mapping.
export async function importFromApi(r: TypeformResponse): Promise<ImportResult> {
  const map = await conferenceMap();
  return transaction((db) => importResponse(db, r, map, 'typeform_sync'));
}

// ---------- File imports: upload, preview, run ----------

export async function createBatch(filename: string, content: string, userId: number): Promise<number> {
  const row = await one<{ id: number }>('INSERT INTO import_batches (filename, content, created_by) VALUES ($1, $2, $3) RETURNING id',
    [filename || 'typeform.csv', content, userId]);
  return row!.id;
}

export async function getBatch(id: number) {
  if (!Number.isInteger(id)) return null;
  return one<{ id: number; filename: string; content: string | null; status: string; counts: Record<string, number> | null; created_at: string; imported_at: string | null }>(
    'SELECT * FROM import_batches WHERE id = $1', [id]);
}

export async function listBatches() {
  return query<{ id: number; filename: string; status: string; counts: Record<string, number> | null; created_at: string; imported_at: string | null }>(
    'SELECT id, filename, status, counts, created_at, imported_at FROM import_batches ORDER BY id DESC LIMIT 20');
}

export interface Preview {
  errors: string[];
  conferenceLabels: string[];
  responses: number;
  alreadyImported: number;
  skipped: number;
  newSpeakers: number;
  existingSpeakers: number;
  proposals: number;
  exceptionsByConference: { conference: string; count: number }[];
  unmatchedCountries: string[];
  unmatchedGenders: string[];
  droppedLinkedIn: string[];
}

// What an import would do, without saving anything. `map` is the mapping chosen on the page.
export async function previewImport(content: string, map: ConferenceMap): Promise<Preview> {
  const { responses, conferenceLabels, errors } = readTypeformExport(content);
  const preview: Preview = {
    errors, conferenceLabels, responses: responses.length, alreadyImported: 0, skipped: 0, newSpeakers: 0, existingSpeakers: 0,
    proposals: 0, exceptionsByConference: [], unmatchedCountries: [], unmatchedGenders: [], droppedLinkedIn: [],
  };
  if (errors.length) return preview;
  const ids = responses.map((r) => r.response_id);
  const done = new Set((await query<{ source_ref: string }>('SELECT DISTINCT source_ref FROM proposals WHERE source_ref = ANY($1)', [ids])).map((x) => x.source_ref));
  const known = new Set((await query<{ email: string }>('SELECT lower(email) AS email FROM users WHERE lower(email) = ANY($1)', [responses.map((r) => r.email)])).map((x) => x.email));
  const confs = new Map<number, Conference>();
  const exceptions = new Map<number, number>();
  const speakers = new Set<string>();
  const add = (list: string[], v: string) => { if (v && !list.includes(v)) list.push(v); };
  for (const r of responses) {
    if (done.has(r.response_id)) { preview.alreadyImported += 1; continue; }
    const targets = [...new Set(r.conferences.map((label) => map[label]).filter((id): id is number => typeof id === 'number'))];
    if (!targets.length) { preview.skipped += 1; continue; }
    if (!speakers.has(r.email)) {
      speakers.add(r.email);
      if (known.has(r.email)) preview.existingSpeakers += 1; else preview.newSpeakers += 1;
    }
    preview.proposals += targets.length;
    if (r.based_in && !countryCode(r.based_in)) add(preview.unmatchedCountries, r.based_in);
    if (!genderAnswer(r.gender, r.gender_other).matched) add(preview.unmatchedGenders, r.gender);
    if (r.linkedin && !normalizeLinkedIn(r.linkedin)) add(preview.droppedLinkedIn, r.linkedin);
    for (const id of targets) {
      if (!confs.has(id)) { const c = await getConference(id); if (c) confs.set(id, c); }
      const c = confs.get(id);
      if (c && c.topicList.length && !r.topics.some((t) => c.topicList.includes(t))) exceptions.set(id, (exceptions.get(id) ?? 0) + 1);
    }
  }
  preview.exceptionsByConference = [...exceptions].map(([id, count]) => ({ conference: confs.get(id)!.name, count }));
  return preview;
}

// Runs a whole file in one transaction, saves the mapping for the live sync, and records the counts.
export async function runBatch(batchId: number, map: ConferenceMap): Promise<{ counts?: Record<string, number>; error?: string }> {
  const batch = await getBatch(batchId);
  if (!batch || batch.status !== 'uploaded' || !batch.content) return { error: 'This upload has already been imported or discarded.' };
  const { responses, conferenceLabels, errors } = readTypeformExport(batch.content);
  if (errors.length) return { error: errors[0] };
  const missing = conferenceLabels.filter((l) => !(l in map));
  if (missing.length) return { error: `Choose a conference or "Skip" for: ${missing.join(', ')}.` };
  await saveConferenceMap({ ...(await conferenceMap()), ...map });
  return transaction(async (db) => {
    const counts = { responses: responses.length, proposals: 0, topic_exceptions: 0, new_speakers: 0, already_imported: 0, skipped: 0 };
    for (const r of responses) {
      const res = await importResponse(db, r, map, 'typeform_import');
      if (res.already_imported) counts.already_imported += 1;
      else if (res.skipped) counts.skipped += 1;
      counts.proposals += res.already_imported ? 0 : res.proposals.length;
      counts.topic_exceptions += res.topic_exceptions.length;
      if (res.new_speaker) counts.new_speakers += 1;
    }
    await query(`UPDATE import_batches SET status = 'imported', content = NULL, counts = $2, imported_at = now() WHERE id = $1`, [batchId, JSON.stringify(counts)], db);
    return { counts };
  });
}

export async function discardBatch(batchId: number): Promise<void> {
  await query(`UPDATE import_batches SET status = 'discarded', content = NULL WHERE id = $1 AND status = 'uploaded'`, [batchId]);
}

// ---------- Topic exceptions ----------

export interface TopicException {
  id: number;
  title: string;
  conference_id: number;
  conference: string;
  speaker: string;
  topics_ticked: string[];
}

export async function topicExceptions(): Promise<TopicException[]> {
  const rows = await query<{ id: number; title: string; conference_id: number; conference: string; speaker: string; source_details: { topics_ticked?: string[] } | null }>(`
    SELECT p.id, p.title, p.conference_id, c.name AS conference, u.name AS speaker, p.source_details
    FROM proposals p JOIN conferences c ON c.id = p.conference_id JOIN users u ON u.id = p.speaker_id
    WHERE p.topic_exception ORDER BY c.name, p.id`);
  return rows.map(({ source_details, ...r }) => ({ ...r, topics_ticked: source_details?.topics_ticked ?? [] }));
}

export type ExceptionChoice = { kind: 'use'; topic: string } | { kind: 'add'; topic: string } | { kind: 'none' };

// Resolves one exception: a topic from the conference's list, a ticked topic added to that list, or no topic.
export async function resolveTopicException(proposalId: number, choice: ExceptionChoice, userId: number): Promise<string | null> {
  return transaction(async (db) => {
    const p = await one<{ id: number; conference_id: number; topic_exception: boolean }>('SELECT id, conference_id, topic_exception FROM proposals WHERE id = $1 FOR UPDATE', [proposalId], db);
    if (!p || !p.topic_exception) return 'This proposal no longer needs a topic choosing.';
    const conf = await one<{ topics: string }>('SELECT topics FROM conferences WHERE id = $1 FOR UPDATE', [p.conference_id], db);
    const list = lines(conf!.topics);
    let topic = '';
    if (choice.kind === 'use') {
      if (!list.includes(choice.topic)) return 'Choose one of the conference\'s topics.';
      topic = choice.topic;
    } else if (choice.kind === 'add') {
      topic = choice.topic.trim();
      if (!topic) return 'Choose a topic to add.';
      if (!list.includes(topic)) {
        await query('UPDATE conferences SET topics = $1, updated_at = now() WHERE id = $2', [[...list, topic].join('\n'), p.conference_id], db);
      }
    }
    await query('UPDATE proposals SET topic = $1, topic_exception = false, updated_at = now() WHERE id = $2', [topic, proposalId], db);
    await logHistory(db, proposalId, userId, 'topic', `Import exception resolved: ${topic || 'no topic'}${choice.kind === 'add' ? ' (added to the conference\'s topics)' : ''}`);
    return null;
  });
}

// ---------- Claim-your-account emails at cutover ----------

export const CLAIM_LIFETIME_MS = 30 * 86_400_000;
const CLAIMABLE = `FROM users u WHERE u.password_hash = '' AND u.role = 'speaker'
  AND EXISTS (SELECT 1 FROM proposals p WHERE p.speaker_id = u.id AND p.source <> 'app')`;
const ALREADY_SENT = `EXISTS (SELECT 1 FROM email_links l WHERE l.user_id = u.id AND l.batch = 'import-claim')`;

export async function claimEmailCounts(): Promise<{ unclaimed: number; alreadySent: number }> {
  const row = await one<{ unclaimed: number; already_sent: number }>(`SELECT COUNT(*) AS unclaimed,
    COUNT(*) FILTER (WHERE ${ALREADY_SENT}) AS already_sent ${CLAIMABLE}`);
  return { unclaimed: row!.unclaimed, alreadySent: row!.already_sent };
}

// One 30-day claim_account link per imported guest who hasn't claimed their account, sent by n8n.
export async function sendClaimEmails(organiserId: number, resend: boolean): Promise<number> {
  const guests = await query<User>(`SELECT u.* ${CLAIMABLE} ${resend ? '' : `AND NOT ${ALREADY_SENT}`} ORDER BY u.id`);
  for (let i = 0; i < guests.length; i += 50) {
    await transaction(async (db) => {
      for (const g of guests.slice(i, i + 50)) {
        await issueLink(db, g, { purpose: 'claim_account', email: true, createdBy: organiserId, lifetimeMs: CLAIM_LIFETIME_MS, batch: 'import-claim' });
      }
    });
  }
  return guests.length;
}

// ---------- Early decisions ----------

// The speaker already knew this decision before the app was used (for example a visa acceptance).
// add-staged-decisions turns this history entry into "already told".
export async function recordToldBeforeImport(proposalId: number, userId: number): Promise<boolean> {
  return transaction(async (db) => {
    const p = await one<{ status: string; source: string }>('SELECT status, source FROM proposals WHERE id = $1', [proposalId], db);
    if (!p || p.source === 'app') return false;
    const done = await one('SELECT 1 FROM proposal_history WHERE proposal_id = $1 AND action = $2', [proposalId, 'decision told before import'], db);
    if (done) return false;
    await logHistory(db, proposalId, userId, 'decision told before import', `Status at the time: ${p.status}`);
    return true;
  });
}

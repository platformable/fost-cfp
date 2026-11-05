// The speaker, proposal and conference objects sent in webhook events and returned by /api/v1/.
// One builder for both, so "no organiser-only information" is enforced in one place:
// the status is what the speaker sees, and internal notes, reviews, scores and unpublished
// decisions are never selected.
import { one, query, type Queryable } from './db';
import { countryName } from './countries';
import { baseUrl } from './links';

export interface SpeakerPayload {
  id: number;
  name: string;
  first_name: string;
  last_name: string;
  email: string;
  job_title: string;
  organization: string;
  bio: string;
  linkedin_profile_url: string | null;
  country: string | null;
  country_code: string | null;
  photo_url: string | null;
  headshot_source: 'photo_url' | 'linkedin' | 'missing';
}

export interface ConferencePayload {
  id: number;
  name: string;
  slug: string;
  location: string;
  start_date: string | null;
  end_date: string | null;
  date_precision: 'day' | 'month' | null;
  cfp_opens: string | null;
  cfp_closes: string | null;
  url: string;
}

export type VisibleStatus = 'under review' | 'accepted' | 'waitlisted' | 'rejected' | 'withdrawn';
export const VISIBLE_STATUSES: VisibleStatus[] = ['under review', 'accepted', 'waitlisted', 'rejected', 'withdrawn'];

export interface ProposalPayload {
  id: number;
  title: string;
  abstract: string;
  format: string;
  topic: string;
  level: string;
  co_speakers: string;
  status: VisibleStatus;
  speaker_confirmation: 'confirmed' | 'declined' | null;
  version: number;
  submitted_at: string;
  updated_at: string;
  proposal_url: string;
  review_url: string;
  speaker: SpeakerPayload;
  conference: ConferencePayload;
}

const SPEAKER_COLUMNS = ['id', 'name', 'first_name', 'last_name', 'email', 'job_title', 'organization', 'bio', 'linkedin_profile_url', 'country', 'photo_url'];
const CONFERENCE_COLUMNS = ['id', 'name', 'slug', 'location', 'start_date', 'end_date', 'date_precision', 'cfp_opens', 'cfp_closes'];
const CONFERENCE_READ = [...CONFERENCE_COLUMNS, 'decisions_published'];
const PROPOSAL_COLUMNS = ['id', 'title', 'abstract', 'format', 'topic', 'level', 'co_speakers', 'status', 'speaker_confirmation', 'version', 'submitted_at', 'updated_at'];

type Row = Record<string, any>;
const orNull = (v: unknown) => (v === '' || v === undefined || v === null ? null : String(v));

export function speakerPayload(u: Row): SpeakerPayload {
  return {
    id: u.id,
    name: u.name,
    first_name: u.first_name,
    last_name: u.last_name,
    email: u.email,
    job_title: u.job_title,
    organization: u.organization,
    bio: u.bio,
    linkedin_profile_url: orNull(u.linkedin_profile_url),
    country: orNull(countryName(u.country)),
    country_code: orNull(u.country),
    photo_url: orNull(u.photo_url),
    headshot_source: u.photo_url ? 'photo_url' : u.linkedin_profile_url ? 'linkedin' : 'missing',
  };
}

export function conferencePayload(c: Row): ConferencePayload {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    location: c.location,
    start_date: c.start_date ?? null,
    end_date: c.end_date ?? null,
    date_precision: c.start_date ? c.date_precision : null,
    cfp_opens: c.cfp_opens ?? null,
    cfp_closes: c.cfp_closes ?? null,
    url: `${baseUrl()}/cfp/${c.slug}`,
  };
}

// Same rule as publicStatus() in proposals.ts: a decision stays "under review" until it is published.
export function visibleStatus(status: string, decisionsPublished: boolean): VisibleStatus {
  if (status === 'withdrawn') return 'withdrawn';
  if (!decisionsPublished || status === 'submitted') return 'under review';
  return status as VisibleStatus;
}

// The same rule in SQL, for filtering lists by the status the speaker sees.
const VISIBLE_STATUS_SQL = `(CASE WHEN p.status = 'withdrawn' THEN 'withdrawn'
  WHEN NOT c.decisions_published OR p.status = 'submitted' THEN 'under review' ELSE p.status END)`;

export function proposalPayload(p: Row, speaker: Row, conf: Row): ProposalPayload {
  const status = visibleStatus(p.status, conf.decisions_published);
  return {
    id: p.id,
    title: p.title,
    abstract: p.abstract,
    format: p.format,
    topic: p.topic,
    level: p.level,
    co_speakers: p.co_speakers,
    status,
    speaker_confirmation: status === 'accepted' && p.speaker_confirmation ? p.speaker_confirmation : null,
    version: p.version,
    submitted_at: p.submitted_at,
    updated_at: p.updated_at,
    proposal_url: `${baseUrl()}/proposals/${p.id}`,
    review_url: `${baseUrl()}/review/proposals/${p.id}`,
    speaker: speakerPayload(speaker),
    conference: conferencePayload(conf),
  };
}

const select = (alias: string, cols: string[]) => cols.map((c) => `${alias}.${c} AS ${alias}_${c}`).join(', ');
const unpack = (row: Row, alias: string, cols: string[]) => Object.fromEntries(cols.map((c) => [c, row[`${alias}_${c}`]]));

const PROPOSAL_SQL = `
  SELECT ${select('p', PROPOSAL_COLUMNS)}, ${select('u', SPEAKER_COLUMNS)}, ${select('c', CONFERENCE_READ)},
         to_char(p.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_ts
  FROM proposals p JOIN users u ON u.id = p.speaker_id JOIN conferences c ON c.id = p.conference_id`;

const fromRow = (r: Row) => proposalPayload(unpack(r, 'p', PROPOSAL_COLUMNS), unpack(r, 'u', SPEAKER_COLUMNS), unpack(r, 'c', CONFERENCE_READ));

export async function proposalPayloadById(id: number, db?: Queryable): Promise<ProposalPayload | null> {
  const row = await one(`${PROPOSAL_SQL} WHERE p.id = $1`, [id], db);
  return row ? fromRow(row) : null;
}

export interface ProposalListFilter {
  conferenceId?: number;
  status?: string;
  updatedSince?: string;
  after?: { updatedAt: string; id: number };
  limit: number;
}

// Ordered by (updated_at, id), oldest change first, so a cursor on that pair returns every item exactly once.
// The cursor keeps updated_at at full database precision (payloads show it to the second only).
// `status` filters on the status the speaker sees ("under review" covers unpublished decisions).
export async function listProposalPayloads(f: ProposalListFilter, db?: Queryable):
Promise<{ items: ProposalPayload[]; cursors: { updatedAt: string; id: number }[] }> {
  const params: unknown[] = [];
  const clauses: string[] = [];
  const param = (v: unknown) => { params.push(v); return `$${params.length}`; };
  if (f.conferenceId !== undefined) clauses.push(`p.conference_id = ${param(f.conferenceId)}`);
  if (f.status) clauses.push(`${VISIBLE_STATUS_SQL} = ${param(f.status)}`);
  if (f.updatedSince) clauses.push(`p.updated_at >= ${param(f.updatedSince)}::timestamptz`);
  if (f.after) clauses.push(`(p.updated_at, p.id) > (${param(f.after.updatedAt)}::timestamptz, ${param(f.after.id)})`);
  const rows = await query(`${PROPOSAL_SQL} ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
    ORDER BY p.updated_at, p.id LIMIT ${param(f.limit)}`, params, db);
  return { items: rows.map(fromRow), cursors: rows.map((r) => ({ updatedAt: r.cursor_ts as string, id: r.p_id as number })) };
}

export async function speakerPayloadById(id: number, db?: Queryable): Promise<SpeakerPayload | null> {
  const row = await one(`SELECT ${SPEAKER_COLUMNS.join(', ')} FROM users WHERE id = $1`, [id], db);
  return row ? speakerPayload(row) : null;
}

export async function conferencePayloadByIdOrSlug(idOrSlug: string, db?: Queryable): Promise<ConferencePayload | null> {
  const byId = /^\d+$/.test(idOrSlug);
  const row = await one(`SELECT ${CONFERENCE_COLUMNS.join(', ')} FROM conferences WHERE ${byId ? 'id' : 'slug'} = $1`,
    [byId ? Number(idOrSlug) : idOrSlug], db);
  return row ? conferencePayload(row) : null;
}

export async function listConferencePayloads(f: { afterId?: number; limit: number }, db?: Queryable): Promise<ConferencePayload[]> {
  const rows = await query(`SELECT ${CONFERENCE_COLUMNS.join(', ')} FROM conferences WHERE id > $1 ORDER BY id LIMIT $2`, [f.afterId ?? 0, f.limit], db);
  return rows.map(conferencePayload);
}

export async function committeePayload(conferenceId: number, db?: Queryable): Promise<{ id: number; name: string; email: string }[]> {
  return query(`SELECT u.id, u.name, u.email FROM conference_reviewers r JOIN users u ON u.id = r.user_id
    WHERE r.conference_id = $1 ORDER BY lower(u.name), u.id`, [conferenceId], db);
}

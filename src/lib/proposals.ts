import type pg from 'pg';
import { one, query, transaction } from './db';
import type { User } from './auth';
import { LEVELS, todayUtc, type Conference } from './conferences';

export const STATUSES = ['submitted', 'accepted', 'waitlisted', 'rejected', 'withdrawn'] as const;
export const DECISIONS = ['submitted', 'accepted', 'waitlisted', 'rejected'] as const;
export const RECOMMENDATIONS = ['accept', 'maybe', 'reject'] as const;
export type Status = (typeof STATUSES)[number];

// The same title, abstract, level, co-speakers and notes go to every conference a speaker picks;
// format and topic are chosen per conference from that conference's own lists.
export const COMMON_FIELDS = ['title', 'abstract', 'level', 'co_speakers', 'notes'] as const;
export const PER_CONFERENCE_FIELDS = ['format', 'topic'] as const;
export const PROPOSAL_FIELDS = [...COMMON_FIELDS, ...PER_CONFERENCE_FIELDS] as const;

export interface Proposal {
  id: number;
  conference_id: number;
  speaker_id: number;
  title: string;
  abstract: string;
  format: string;
  topic: string;
  level: string;
  co_speakers: string;
  notes: string;
  status: Status;
  speaker_confirmation: '' | 'confirmed' | 'declined';
  feedback_to_speaker: string;
  internal_notes: string;
  version: number;
  submitted_at: string;
  updated_at: string;
  decided_at: string | null;
  confirmed_at: string | null;
}

export interface ProposalDetail extends Proposal {
  speaker_name: string;
  speaker_email: string;
  speaker_organization: string;
  speaker_job_title: string;
  speaker_bio: string;
  speaker_linkedin_profile_url: string;
  speaker_country: string;
  speaker_photo_url: string;
  conference_name: string;
  conference_slug: string;
}

export async function getProposal(id: number): Promise<ProposalDetail | null> {
  if (!Number.isInteger(id)) return null;
  return one<ProposalDetail>(`
    SELECT p.*, u.name AS speaker_name, u.email AS speaker_email, u.organization AS speaker_organization,
           u.job_title AS speaker_job_title, u.bio AS speaker_bio, u.linkedin_profile_url AS speaker_linkedin_profile_url,
           u.country AS speaker_country, u.photo_url AS speaker_photo_url,
           c.name AS conference_name, c.slug AS conference_slug
    FROM proposals p JOIN users u ON u.id = p.speaker_id JOIN conferences c ON c.id = p.conference_id
    WHERE p.id = $1`, [id]);
}

// ---------- What the speaker can see and do ----------

// Decisions stay "under review" for the speaker until the organisers publish them.
export function publicStatus(p: Pick<Proposal, 'status'>, conf: Pick<Conference, 'decisions_published'>): string {
  if (p.status === 'withdrawn') return 'withdrawn';
  if (!conf.decisions_published || p.status === 'submitted') return 'under review';
  return p.status;
}

const DAY_MS = 86400000;

// Speakers may keep editing after the call closes, right up to the conference:
// the last editing day is the day before start_date. No start date = no deadline.
export function editDeadline(conf: Pick<Conference, 'start_date'>): string {
  if (!conf.start_date) return '';
  return new Date(Date.parse(`${conf.start_date}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
}

type EditConf = Pick<Conference, 'start_date' | 'archived' | 'decisions_published'>;
type EditProposal = Pick<Proposal, 'status' | 'speaker_confirmation'>;

export function canSpeakerEdit(p: EditProposal, conf: EditConf, today = todayUtc()): boolean {
  if (p.status === 'withdrawn' || conf.archived) return false;
  // Unpublished decisions must not change what the speaker can do, or the edit link would leak them.
  if (conf.decisions_published) {
    if (p.status === 'rejected') return false;
    if (p.speaker_confirmation === 'declined') return false;
  }
  const deadline = editDeadline(conf);
  return !deadline || today <= deadline;
}

export interface EditWindow {
  editable: boolean;
  deadline: string;
  daysLeft: number | null;
  label: string;
  tone: 'open' | 'soon' | 'closed';
}

// Everything the "time left to edit" label needs.
export function editWindow(p: EditProposal, conf: EditConf, today = todayUtc()): EditWindow {
  const deadline = editDeadline(conf);
  const editable = canSpeakerEdit(p, conf, today);
  if (!editable) return { editable, deadline, daysLeft: null, label: 'Editing closed', tone: 'closed' };
  if (!deadline) return { editable, deadline, daysLeft: null, label: 'No edit deadline', tone: 'open' };
  const daysLeft = Math.round((Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
  const label = daysLeft === 0 ? 'Last day to edit' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left to edit`;
  return { editable, deadline, daysLeft, label, tone: daysLeft <= 7 ? 'soon' : 'open' };
}

// ---------- Reading the proposal form ----------

export type CommonValues = Record<(typeof COMMON_FIELDS)[number], string>;
export type Choice = { format: string; topic: string };

export function readCommon(form: FormData): { values: CommonValues; errors: string[] } {
  const values = Object.fromEntries(COMMON_FIELDS.map((f) => [f, String(form.get(f) ?? '').trim()])) as CommonValues;
  const errors: string[] = [];
  if (!values.title) errors.push('Title is required.');
  if (values.title.length > 200) errors.push('Title must be 200 characters or fewer.');
  if (!values.abstract) errors.push('Abstract is required.');
  if (values.abstract.length > 3000) errors.push('Abstract must be 3000 characters or fewer.');
  if (values.level && !LEVELS.includes(values.level)) errors.push('Please choose a valid audience level.');
  return { values, errors };
}

// Format and topic for one conference, posted as format_<id> and topic_<id>.
// `current` is the proposal being edited, so a value an organiser set can be kept even if it's no longer listed.
export function readConferenceChoice(form: FormData, conf: Conference, opts: { named?: boolean; current?: Choice } = {}) {
  const pick: Choice = {
    format: String(form.get(`format_${conf.id}`) ?? '').trim(),
    topic: String(form.get(`topic_${conf.id}`) ?? '').trim(),
  };
  const { current } = opts;
  const errors: string[] = [];
  const where = opts.named ? ` for ${conf.name}` : '';
  if (!conf.formatList.includes(pick.format) && !(current && pick.format === current.format)) {
    errors.push(`Please choose a session format${where}.`);
  }
  if (conf.topicList.length) {
    if (!conf.topicList.includes(pick.topic) && !(current && pick.topic && pick.topic === current.topic)) {
      errors.push(`Please choose a topic${where}.`);
    }
  } else if (!(current && pick.topic === current.topic)) {
    pick.topic = '';
  }
  return { pick, errors };
}

async function logHistory(db: pg.PoolClient, proposalId: number, userId: number | null, action: string, detail = '') {
  await query('INSERT INTO proposal_history (proposal_id, user_id, action, detail) VALUES ($1, $2, $3, $4)', [proposalId, userId, action, detail], db);
}

// One submission creates one proposal per conference, all or nothing.
export async function submitProposals(speakerId: number, common: CommonValues, picks: { conf: Conference; pick: Choice }[]): Promise<number[]> {
  return transaction(async (db) => {
    const ids: number[] = [];
    for (const { conf, pick } of picks) {
      const row = { ...common, ...pick };
      const inserted = await one<{ id: number }>(`
        INSERT INTO proposals (conference_id, speaker_id, ${PROPOSAL_FIELDS.join(', ')})
        VALUES ($1, $2, ${PROPOSAL_FIELDS.map((_, i) => `$${i + 3}`).join(', ')}) RETURNING id`,
      [conf.id, speakerId, ...PROPOSAL_FIELDS.map((f) => row[f])], db);
      await logHistory(db, inserted!.id, speakerId, 'submitted');
      ids.push(inserted!.id);
    }
    return ids;
  });
}

export async function updateBySpeaker(p: Proposal, userId: number, values: CommonValues & Choice): Promise<string[]> {
  const changed = PROPOSAL_FIELDS.filter((f) => String(values[f] ?? '') !== String(p[f] ?? ''));
  if (!changed.length) return [];
  await transaction(async (db) => {
    await query(`UPDATE proposals SET ${PROPOSAL_FIELDS.map((f, i) => `${f} = $${i + 1}`).join(', ')},
                 version = version + 1, updated_at = now() WHERE id = $${PROPOSAL_FIELDS.length + 1}`,
    [...PROPOSAL_FIELDS.map((f) => values[f]), p.id], db);
    await logHistory(db, p.id, userId, 'edited', `Changed: ${changed.join(', ')}`);
  });
  return changed;
}

export async function withdraw(p: Proposal, userId: number): Promise<void> {
  if (p.status === 'withdrawn') return;
  await transaction(async (db) => {
    await query(`UPDATE proposals SET status = 'withdrawn', updated_at = now() WHERE id = $1`, [p.id], db);
    await logHistory(db, p.id, userId, 'withdrawn', `Previous status: ${p.status}`);
  });
}

export async function confirmSlot(p: Proposal, userId: number, answer: 'confirmed' | 'declined'): Promise<void> {
  await transaction(async (db) => {
    await query('UPDATE proposals SET speaker_confirmation = $1, confirmed_at = now(), updated_at = now() WHERE id = $2', [answer, p.id], db);
    await logHistory(db, p.id, userId, answer);
  });
}

export async function speakerProposals(speakerId: number) {
  return query<Proposal & { conference_name: string; conference_slug: string }>(`
    SELECT p.*, c.name AS conference_name, c.slug AS conference_slug
    FROM proposals p JOIN conferences c ON c.id = p.conference_id
    WHERE p.speaker_id = $1 ORDER BY p.submitted_at DESC, p.id DESC`, [speakerId]);
}

export async function history(proposalId: number, actions?: string[]) {
  return query<{ id: number; action: string; detail: string; created_at: string; user_name: string | null }>(`
    SELECT h.*, u.name AS user_name FROM proposal_history h LEFT JOIN users u ON u.id = h.user_id
    WHERE h.proposal_id = $1 ${actions ? 'AND h.action = ANY($2)' : ''} ORDER BY h.id DESC`,
  actions ? [proposalId, actions] : [proposalId]);
}

// ---------- Decisions (organisers) ----------

async function applyDecision(db: pg.PoolClient, p: Proposal, status: string, userId: number, extra: Record<string, string> = {}) {
  const sets = ['updated_at = now()'];
  const params: unknown[] = [];
  const add = (sql: string, v?: unknown) => { if (v !== undefined) params.push(v); sets.push(sql.replace('?', `$${params.length}`)); };
  if (status !== p.status) {
    add('status = ?', status);
    sets.push(status === 'submitted' ? 'decided_at = NULL' : 'decided_at = now()');
    // A new decision resets any earlier confirmation from the speaker.
    if (status !== 'accepted') sets.push(`speaker_confirmation = ''`, 'confirmed_at = NULL');
  }
  for (const [k, v] of Object.entries(extra)) add(`${k} = ?`, v);
  params.push(p.id);
  await query(`UPDATE proposals SET ${sets.join(', ')} WHERE id = $${params.length}`, params, db);
  if (status !== p.status) await logHistory(db, p.id, userId, 'decision', `${p.status} → ${status}`);
  if (extra.topic !== undefined && extra.topic !== p.topic) {
    await logHistory(db, p.id, userId, 'topic', `${p.topic || 'none'} → ${extra.topic || 'none'}`);
  }
}

export async function decide(p: Proposal, userId: number, status: string, extra: Record<string, string>): Promise<void> {
  await transaction((db) => applyDecision(db, p, status, userId, extra));
}

export async function bulkDecide(conferenceId: number, ids: number[], status: string, userId: number): Promise<number> {
  return transaction(async (db) => {
    let n = 0;
    for (const id of ids) {
      const p = await one<Proposal>('SELECT * FROM proposals WHERE id = $1 AND conference_id = $2', [id, conferenceId], db);
      if (p && p.status !== 'withdrawn') { await applyDecision(db, p, status, userId); n += 1; }
    }
    return n;
  });
}

// ---------- Committee review ----------

export interface ReviewFilter { status: string; topic: string; todo: boolean; sort: 'score' | 'reviews' | 'title' | 'newest' }

export async function reviewList(conf: Conference, user: User, filter: ReviewFilter) {
  const params: unknown[] = [user.id, conf.id];
  const clauses = ['p.conference_id = $2'];
  if (filter.status) { params.push(filter.status); clauses.push(`p.status = $${params.length}`); } else clauses.push(`p.status <> 'withdrawn'`);
  if (filter.topic) { params.push(filter.topic); clauses.push(`p.topic = $${params.length}`); }
  if (filter.todo) clauses.push('my.id IS NULL AND p.speaker_id <> $1');
  const order = {
    score: 'avg_score DESC NULLS LAST, p.id',
    reviews: 'review_count ASC, p.id',
    title: 'lower(p.title)',
    newest: 'p.submitted_at DESC, p.id DESC',
  }[filter.sort];
  return query<{
    id: number; title: string; format: string; topic: string; level: string; status: Status; speaker_confirmation: string;
    submitted_at: string; speaker_id: number; speaker_name: string; speaker_organization: string;
    review_count: number; avg_score: number | null; my_score: number | null; my_recommendation: string | null;
  }>(`
    SELECT p.id, p.title, p.format, p.topic, p.level, p.status, p.speaker_confirmation, p.submitted_at, p.speaker_id,
           u.name AS speaker_name, u.organization AS speaker_organization,
           (SELECT COUNT(*) FROM reviews r WHERE r.proposal_id = p.id) AS review_count,
           (SELECT ROUND(AVG(score), 2) FROM reviews r WHERE r.proposal_id = p.id) AS avg_score,
           my.score AS my_score, my.recommendation AS my_recommendation
    FROM proposals p
    JOIN users u ON u.id = p.speaker_id
    LEFT JOIN reviews my ON my.proposal_id = p.id AND my.reviewer_id = $1
    WHERE ${clauses.join(' AND ')}
    ORDER BY ${order}`, params);
}

export async function statusCounts(conferenceId: number): Promise<Record<string, number>> {
  const rows = await query<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM proposals WHERE conference_id = $1 GROUP BY status', [conferenceId]);
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

export async function reviewsFor(proposalId: number) {
  return query<{ id: number; reviewer_id: number; reviewer_name: string; score: number; recommendation: string; comments: string; updated_at: string }>(`
    SELECT r.*, u.name AS reviewer_name FROM reviews r JOIN users u ON u.id = r.reviewer_id
    WHERE r.proposal_id = $1 ORDER BY r.updated_at DESC`, [proposalId]);
}

export async function saveReview(proposalId: number, reviewerId: number, score: number, recommendation: string, comments: string) {
  await query(`
    INSERT INTO reviews (proposal_id, reviewer_id, score, recommendation, comments) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (proposal_id, reviewer_id) DO UPDATE SET
      score = EXCLUDED.score, recommendation = EXCLUDED.recommendation, comments = EXCLUDED.comments, updated_at = now()`,
  [proposalId, reviewerId, score, recommendation, comments]);
}

// Previous and next active proposals in the committee list order (newest first).
export async function neighbours(conferenceId: number, proposalId: number) {
  const ids = (await query<{ id: number }>(`SELECT id FROM proposals WHERE conference_id = $1 AND status <> 'withdrawn'
    ORDER BY submitted_at DESC, id DESC`, [conferenceId])).map((r) => r.id);
  const i = ids.indexOf(proposalId);
  return { prevId: i > 0 ? ids[i - 1] : null, nextId: i >= 0 && i < ids.length - 1 ? ids[i + 1] : null };
}

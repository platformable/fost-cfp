import { one, query } from './db';
import type { User } from './auth';

export const DEFAULT_FORMATS = ['Talk (30 min)', 'Lightning talk (10 min)', 'Workshop (90 min)', 'Panel (45 min)'];
export const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'All levels'];

export type DatePrecision = 'day' | 'month';

export type CfpState = 'open' | 'upcoming' | 'closed' | 'archived';

export interface ConferenceRow {
  id: number;
  name: string;
  slug: string;
  description: string;
  location: string;
  website: string;
  start_date: string | null;
  end_date: string | null;
  // 'month': only the month and year of start_date are known (start_date is the 1st, end_date is null).
  date_precision: DatePrecision;
  cfp_opens: string | null;
  cfp_closes: string | null;
  topics: string;
  formats: string;
  blind_review: boolean;
  decisions_published: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Conference extends ConferenceRow {
  topicList: string[];
  formatList: string[];
  cfpState: CfpState;
  cfpOpen: boolean;
}

export const lines = (text: string | null | undefined) =>
  String(text ?? '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

export const todayUtc = () => new Date().toISOString().slice(0, 10);

// Dates are inclusive. No opening date = open now; no closing date = never closes.
export function cfpState(conf: Pick<ConferenceRow, 'archived' | 'cfp_opens' | 'cfp_closes'>, today = todayUtc()): CfpState {
  if (conf.archived) return 'archived';
  if (conf.cfp_opens && today < conf.cfp_opens) return 'upcoming';
  if (conf.cfp_closes && today > conf.cfp_closes) return 'closed';
  return 'open';
}

export function decorate(row: ConferenceRow): Conference {
  const state = cfpState(row);
  return {
    ...row,
    topicList: lines(row.topics),
    formatList: lines(row.formats).length ? lines(row.formats) : DEFAULT_FORMATS,
    cfpState: state,
    cfpOpen: state === 'open',
  };
}

export async function getConference(idOrSlug: number | string): Promise<Conference | null> {
  const byId = /^\d+$/.test(String(idOrSlug));
  const row = await one<ConferenceRow>(`SELECT * FROM conferences WHERE ${byId ? 'id' : 'slug'} = $1`, [byId ? Number(idOrSlug) : String(idOrSlug)]);
  return row ? decorate(row) : null;
}

export async function listConferences({ includeArchived = false } = {}): Promise<Conference[]> {
  const rows = await query<ConferenceRow>(includeArchived
    ? 'SELECT * FROM conferences ORDER BY start_date DESC NULLS LAST, id DESC'
    : 'SELECT * FROM conferences WHERE NOT archived ORDER BY start_date ASC NULLS LAST, id ASC');
  return rows.map(decorate);
}

export async function openConferences(): Promise<Conference[]> {
  return (await listConferences()).filter((c) => c.cfpOpen);
}

export async function isReviewerFor(user: User | null, conferenceId: number): Promise<boolean> {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'reviewer') return false;
  return !!(await one('SELECT 1 FROM conference_reviewers WHERE conference_id = $1 AND user_id = $2', [conferenceId, user.id]));
}

export function slugify(text: string): string {
  return String(text).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '')
    .trim().replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'conference';
}

// ---------- Organiser editing ----------

const TEXT_FIELDS = ['name', 'description', 'location', 'website', 'topics', 'formats'] as const;
const DATE_FIELDS = ['start_date', 'end_date', 'cfp_opens', 'cfp_closes'] as const;

export type ConferenceInput = Record<(typeof TEXT_FIELDS)[number] | (typeof DATE_FIELDS)[number] | 'slug', string> & {
  blind_review: boolean;
  date_precision: DatePrecision;
  // Month-only form fields, kept so the form can be shown again after an error.
  start_month: string;
  start_year: string;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

// Last day of the month that a 'YYYY-MM-01' date falls in.
export const lastDayOfMonth = (firstOfMonth: string) => {
  const [y, m] = firstOfMonth.split('-').map(Number);
  return `${y}-${pad2(m)}-${pad2(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
};

export function readConferenceForm(form: FormData): { values: ConferenceInput; errors: string[] } {
  const get = (k: string) => String(form.get(k) ?? '').trim();
  const values = Object.fromEntries([...TEXT_FIELDS, ...DATE_FIELDS].map((f) => [f, get(f)])) as unknown as ConferenceInput;
  values.blind_review = form.get('blind_review') != null;
  values.slug = slugify(get('slug') || values.name);
  values.date_precision = get('date_precision') === 'month' ? 'month' : 'day';
  values.start_month = get('start_month');
  values.start_year = get('start_year');
  const errors: string[] = [];
  if (!values.name) errors.push('Name is required.');
  if (values.date_precision === 'month') {
    // Month only: store the first of the month and no end date.
    const month = Number(values.start_month);
    const year = Number(values.start_year);
    values.end_date = '';
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) {
      values.start_date = '';
      errors.push('Choose the month and year the conference takes place.');
    } else {
      values.start_date = `${year}-${pad2(month)}-01`;
      if (values.cfp_closes && values.cfp_closes > lastDayOfMonth(values.start_date)) {
        errors.push('The call must close before the end of the conference month.');
      }
    }
  }
  for (const f of DATE_FIELDS) {
    if (values[f] && !/^\d{4}-\d{2}-\d{2}$/.test(values[f])) errors.push(`${f.replace('_', ' ')} must be a date.`);
  }
  if (values.cfp_opens && values.cfp_closes && values.cfp_closes < values.cfp_opens) errors.push('The CFP must close after it opens.');
  if (values.start_date && values.end_date && values.end_date < values.start_date) errors.push('The conference must end after it starts.');
  return { values, errors };
}

const COLUMNS = [...TEXT_FIELDS, ...DATE_FIELDS, 'date_precision', 'blind_review', 'slug'] as const;
const columnValue = (v: ConferenceInput, c: (typeof COLUMNS)[number]) =>
  (DATE_FIELDS as readonly string[]).includes(c) ? (v[c as keyof ConferenceInput] || null) : v[c as keyof ConferenceInput];

export async function saveConference(values: ConferenceInput, id?: number): Promise<{ id?: number; errors: string[] }> {
  const clash = await one('SELECT 1 FROM conferences WHERE slug = $1 AND id <> $2', [values.slug, id ?? 0]);
  if (clash) return { errors: ['Another conference already uses that URL slug.'] };
  const params = COLUMNS.map((c) => columnValue(values, c));
  if (id) {
    await query(`UPDATE conferences SET ${COLUMNS.map((c, i) => `${c} = $${i + 1}`).join(', ')}, updated_at = now()
                 WHERE id = $${COLUMNS.length + 1}`, [...params, id]);
    return { id, errors: [] };
  }
  const row = await one<{ id: number }>(`INSERT INTO conferences (${COLUMNS.join(', ')})
    VALUES (${COLUMNS.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`, params);
  return { id: row!.id, errors: [] };
}

export async function setConferenceFlag(id: number, flag: 'decisions_published' | 'archived', value: boolean): Promise<void> {
  await query(`UPDATE conferences SET ${flag} = $1, updated_at = now() WHERE id = $2`, [value, id]);
  if (flag === 'decisions_published') {
    // Mark decided proposals as changed so "updated since" exports pick up the newly visible decisions.
    await query(`UPDATE proposals SET updated_at = now() WHERE conference_id = $1 AND status IN ('accepted', 'waitlisted', 'rejected')`, [id]);
  }
}

export async function committee(conferenceId: number) {
  return query<{ id: number; name: string; email: string; role: string; reviews_done: number }>(`
    SELECT u.id, u.name, u.email, u.role,
           (SELECT COUNT(*) FROM reviews r JOIN proposals p ON p.id = r.proposal_id
            WHERE r.reviewer_id = u.id AND p.conference_id = $1) AS reviews_done
    FROM conference_reviewers cr JOIN users u ON u.id = cr.user_id
    WHERE cr.conference_id = $1 ORDER BY u.last_name, u.first_name`, [conferenceId]);
}

// Adds someone to a committee by email; a speaker becomes a reviewer.
export async function addReviewer(conferenceId: number, email: string): Promise<{ name?: string; error?: string }> {
  const user = await one<{ id: number; name: string; role: string }>('SELECT id, name, role FROM users WHERE lower(email) = lower($1)', [email.trim()]);
  if (!user) return { error: `No account found for ${email}. Ask them to register first, then add them here.` };
  if (user.role === 'speaker') await query(`UPDATE users SET role = 'reviewer', updated_at = now() WHERE id = $1`, [user.id]);
  await query('INSERT INTO conference_reviewers (conference_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [conferenceId, user.id]);
  return { name: user.name };
}

export async function removeReviewer(conferenceId: number, userId: number): Promise<void> {
  await query('DELETE FROM conference_reviewers WHERE conference_id = $1 AND user_id = $2', [conferenceId, userId]);
}

export async function conferenceStats(conferenceId: number) {
  return (await one<{ total: number; accepted: number; confirmed: number; pending: number; reviewers: number }>(`
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'accepted') AS accepted,
           COUNT(*) FILTER (WHERE speaker_confirmation = 'confirmed') AS confirmed,
           COUNT(*) FILTER (WHERE status = 'submitted') AS pending,
           (SELECT COUNT(*) FROM conference_reviewers WHERE conference_id = $1) AS reviewers
    FROM proposals WHERE conference_id = $1 AND status <> 'withdrawn'`, [conferenceId]))!;
}

// Spreadsheet exports. Every export is a flat table with stable, snake_case column headers so it
// can be fed straight into mail merges, Zapier/Make, Google Sheets IMPORTDATA, Airtable and so on.
import ExcelJS from 'exceljs';
import { query } from './db';
import { countryName } from './countries';
import { conferenceDates } from './format';
import { getConference } from './conferences';
import { STATUSES } from './proposals';

export interface ExportFilters { conferenceId?: number; slug?: string; status?: string; updatedSince?: string }
type Row = Record<string, unknown>;

export const baseUrl = () => (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');

// Where to get a speaker's headshot: their own photo URL if given, otherwise their LinkedIn profile photo.
const headshotSource = (photoUrl: unknown, linkedinUrl: unknown) => (photoUrl ? 'photo_url' : linkedinUrl ? 'linkedin' : 'missing');

function where(f: ExportFilters) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (f.conferenceId !== undefined) { params.push(f.conferenceId); clauses.push(`p.conference_id = $${params.length}`); }
  if (f.status) { params.push(f.status); clauses.push(`p.status = $${params.length}`); }
  if (f.updatedSince) { params.push(f.updatedSince); clauses.push(`p.updated_at >= $${params.length}`); }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

async function submissions(f: ExportFilters = {}): Promise<Row[]> {
  const w = where(f);
  const rows = await query(`
    SELECT p.id AS proposal_id, c.name AS conference, c.slug AS conference_slug,
           p.title, p.format, p.topic, p.level, p.abstract, p.co_speakers, p.notes AS notes_to_committee,
           p.status, c.decisions_published, p.speaker_confirmation, p.feedback_to_speaker, p.internal_notes,
           u.id AS speaker_id, u.name AS speaker_name, u.first_name AS speaker_first_name, u.last_name AS speaker_last_name,
           u.email AS speaker_email, u.organization AS speaker_organization, u.job_title AS speaker_job_title,
           u.phone AS speaker_phone, u.country AS speaker_country, u.country AS speaker_country_code,
           u.linkedin_profile_url AS speaker_linkedin_profile_url, u.photo_url AS speaker_photo_url, u.bio AS speaker_bio,
           (SELECT COUNT(*) FROM reviews r WHERE r.proposal_id = p.id) AS review_count,
           (SELECT ROUND(AVG(score), 2) FROM reviews r WHERE r.proposal_id = p.id) AS average_score,
           (SELECT COUNT(*) FROM reviews r WHERE r.proposal_id = p.id AND r.recommendation = 'accept') AS votes_accept,
           (SELECT COUNT(*) FROM reviews r WHERE r.proposal_id = p.id AND r.recommendation = 'maybe') AS votes_maybe,
           (SELECT COUNT(*) FROM reviews r WHERE r.proposal_id = p.id AND r.recommendation = 'reject') AS votes_reject,
           p.version, p.submitted_at, p.updated_at, p.decided_at, p.confirmed_at
    FROM proposals p JOIN users u ON u.id = p.speaker_id JOIN conferences c ON c.id = p.conference_id
    ${w.sql}
    ORDER BY c.id, p.id`, w.params);
  return rows.map((r) => ({
    ...r,
    speaker_country: countryName(r.speaker_country),
    speaker_headshot_source: headshotSource(r.speaker_photo_url, r.speaker_linkedin_profile_url),
    decisions_published: r.decisions_published ? 'yes' : 'no',
    average_score: r.average_score ?? '',
    decided_at: r.decided_at ?? '',
    confirmed_at: r.confirmed_at ?? '',
    proposal_url: `${baseUrl()}/proposals/${r.proposal_id}`,
    review_url: `${baseUrl()}/review/proposals/${r.proposal_id}`,
  }));
}

async function program(f: ExportFilters = {}): Promise<Row[]> {
  return (await submissions({ ...f, status: 'accepted' })).map((r) => ({
    proposal_id: r.proposal_id,
    conference: r.conference,
    title: r.title,
    format: r.format,
    topic: r.topic,
    level: r.level,
    abstract: r.abstract,
    speaker_name: r.speaker_name,
    speaker_first_name: r.speaker_first_name,
    speaker_last_name: r.speaker_last_name,
    speaker_email: r.speaker_email,
    speaker_organization: r.speaker_organization,
    speaker_job_title: r.speaker_job_title,
    speaker_country: r.speaker_country,
    speaker_bio: r.speaker_bio,
    speaker_photo_url: r.speaker_photo_url,
    speaker_headshot_source: r.speaker_headshot_source,
    speaker_linkedin_profile_url: r.speaker_linkedin_profile_url,
    co_speakers: r.co_speakers,
    decisions_published: r.decisions_published,
    speaker_confirmation: r.speaker_confirmation || 'pending',
    confirmed_at: r.confirmed_at,
    decided_at: r.decided_at,
    updated_at: r.updated_at,
  }));
}

async function speakers(f: ExportFilters = {}): Promise<Row[]> {
  const w = where(f);
  const rows = await query(`
    SELECT u.id AS speaker_id, u.name, u.first_name, u.last_name, u.email, u.organization, u.job_title, u.phone,
           u.country, u.country AS country_code, u.linkedin_profile_url, u.photo_url, u.bio,
           COUNT(p.id) AS proposals_total,
           COUNT(*) FILTER (WHERE p.status = 'accepted') AS proposals_accepted,
           COUNT(*) FILTER (WHERE p.status = 'waitlisted') AS proposals_waitlisted,
           COUNT(*) FILTER (WHERE p.status = 'rejected') AS proposals_rejected,
           COUNT(*) FILTER (WHERE p.status = 'submitted') AS proposals_pending,
           COUNT(*) FILTER (WHERE p.status = 'withdrawn') AS proposals_withdrawn,
           COUNT(*) FILTER (WHERE p.speaker_confirmation = 'confirmed') AS talks_confirmed,
           string_agg(DISTINCT c.name, ',') AS conferences,
           u.created_at, u.updated_at
    FROM users u JOIN proposals p ON p.speaker_id = u.id JOIN conferences c ON c.id = p.conference_id
    ${w.sql}
    GROUP BY u.id
    ORDER BY lower(u.last_name), lower(u.first_name)`, w.params);
  return rows.map((r) => ({ ...r, country: countryName(r.country), headshot_source: headshotSource(r.photo_url, r.linkedin_profile_url) }));
}

async function reviews(f: ExportFilters = {}): Promise<Row[]> {
  const w = where(f);
  return query(`
    SELECT r.id AS review_id, p.id AS proposal_id, c.name AS conference, p.title, u.name AS speaker_name,
           rv.name AS reviewer_name, rv.email AS reviewer_email,
           r.score, r.recommendation, r.comments, r.created_at, r.updated_at
    FROM reviews r
    JOIN proposals p ON p.id = r.proposal_id JOIN users u ON u.id = p.speaker_id
    JOIN users rv ON rv.id = r.reviewer_id JOIN conferences c ON c.id = p.conference_id
    ${w.sql}
    ORDER BY p.id, r.id`, w.params);
}

async function conferences(): Promise<Row[]> {
  const rows = await query(`
    SELECT c.id AS conference_id, c.name, c.slug, c.location, c.website, c.start_date, c.end_date,
           c.cfp_opens, c.cfp_closes, c.topics, c.blind_review, c.decisions_published, c.archived,
           COUNT(p.id) AS proposals_total,
           COUNT(*) FILTER (WHERE p.status = 'accepted') AS proposals_accepted,
           COUNT(*) FILTER (WHERE p.speaker_confirmation = 'confirmed') AS talks_confirmed,
           c.date_precision AS _date_precision
    FROM conferences c LEFT JOIN proposals p ON p.conference_id = c.id
    GROUP BY c.id ORDER BY c.start_date NULLS LAST, c.id`);
  const yes = (v: unknown) => (v ? 'yes' : 'no');
  // New columns go after all existing ones, so sheets that read columns by position keep working.
  return rows.map(({ _date_precision, ...r }) => ({
    ...r,
    topics: String(r.topics).split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join('; '),
    start_date: r.start_date ?? '', end_date: r.end_date ?? '', cfp_opens: r.cfp_opens ?? '', cfp_closes: r.cfp_closes ?? '',
    blind_review: yes(r.blind_review), decisions_published: yes(r.decisions_published), archived: yes(r.archived),
    date_precision: r.start_date ? _date_precision : '',
    dates_display: conferenceDates({ start_date: r.start_date, end_date: r.end_date, date_precision: _date_precision }),
  }));
}

export const DATASETS: Record<string, (f: ExportFilters) => Promise<Row[]>> = { submissions, program, speakers, reviews, conferences };

export function toCsv(rows: Row[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    // Neutralise spreadsheet formula injection from user-entered text.
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\r\n') + '\r\n';
}

export async function toXlsx(sheets: Record<string, Row[]>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FOST Call for Speakers';
  wb.created = new Date();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name.charAt(0).toUpperCase() + name.slice(1));
    const headers = rows.length ? Object.keys(rows[0]) : ['(no rows)'];
    ws.columns = headers.map((h) => ({
      header: h,
      key: h,
      width: Math.min(60, Math.max(12, h.length + 2, ...rows.slice(0, 50).map((r) => String(r[h] ?? '').length * 0.6))),
    }));
    ws.addRows(rows);
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Shared by the admin download route and the token API route.
export async function exportResponse(dataset: string, ext: string, filters: ExportFilters): Promise<Response> {
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `${filters.slug ? `${filters.slug}-` : ''}${dataset}-${stamp}`;
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  const attach = (name: string) => ({ 'Content-Disposition': `attachment; filename="${name}"` });
  const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (dataset === 'workbook') {
    if (ext !== 'xlsx') return new Response('The workbook is only available as .xlsx', { status: 404 });
    const sheets: Record<string, Row[]> = {};
    for (const [name, fn] of Object.entries(DATASETS)) sheets[name] = await fn(filters);
    return new Response(new Uint8Array(await toXlsx(sheets)), { headers: { ...headers, ...attach(`${base}.xlsx`), 'Content-Type': XLSX } });
  }
  const fn = DATASETS[dataset];
  if (!fn) return new Response(`Unknown dataset. Use one of: ${Object.keys(DATASETS).join(', ')}, workbook`, { status: 404 });
  const rows = await fn(filters);
  if (ext === 'csv') {
    return new Response(`﻿${toCsv(rows)}`, { headers: { ...headers, ...attach(`${base}.csv`), 'Content-Type': 'text/csv; charset=utf-8' } });
  }
  if (ext === 'xlsx') {
    return new Response(new Uint8Array(await toXlsx({ [dataset]: rows })), { headers: { ...headers, ...attach(`${base}.xlsx`), 'Content-Type': XLSX } });
  }
  if (ext === 'json') return Response.json(rows, { headers });
  return new Response('Unknown format. Use .csv, .xlsx or .json', { status: 404 });
}

// Reads ?conference=<id|slug>&status=<status>&updated_since=<ISO time> from a request URL.
export async function filtersFrom(params: URLSearchParams): Promise<ExportFilters> {
  const f: ExportFilters = {};
  const conference = params.get('conference');
  if (conference) {
    const conf = await getConference(conference);
    f.conferenceId = conf ? conf.id : -1;
    f.slug = conf ? conf.slug : 'unknown';
  }
  const status = params.get('status') ?? '';
  if ((STATUSES as readonly string[]).includes(status)) f.status = status;
  const since = params.get('updated_since');
  if (since) {
    const d = new Date(since);
    if (!Number.isNaN(d.getTime())) f.updatedSince = d.toISOString();
  }
  return f;
}

export const parseExportFile = (file: string) => /^([a-z]+)\.(csv|xlsx|json)$/.exec(file);

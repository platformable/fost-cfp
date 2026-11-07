// Guest submissions: proposals from people without an account. They are saved as awaiting
// confirmation and count only once the emailed confirmation link is used. A guest is a speaker
// account without a password; it can be claimed later by setting one through an emailed link.
import crypto from 'node:crypto';
import { ensureSecret, one, query, transaction } from './db';
import { hashPassword, type User } from './auth';
import type { Conference } from './conferences';
import { issueLink, type EmailLink } from './email-links';
import { recordProposalEvent, recordSpeakerEvent } from './events';
import { insertProposals, type Choice, type CommonValues } from './proposals';

export const MAX_AWAITING_PER_EMAIL = 5;
export const MIN_FORM_SECONDS = 3;
export const GUEST_EXPIRY = '6 months';

export interface GuestDetails { first_name: string; last_name: string; email: string; organization: string }

export function readGuest(form: FormData): { guest: GuestDetails; errors: string[] } {
  const get = (k: string) => String(form.get(k) ?? '').trim();
  const guest = { first_name: get('guest_first_name'), last_name: get('guest_last_name'), email: get('guest_email').toLowerCase(), organization: get('guest_organization') };
  const errors: string[] = [];
  if (!guest.first_name) errors.push('Please enter your first name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guest.email)) errors.push('Please enter your email address, so we can ask you to confirm your proposal.');
  return { guest, errors };
}

// ---------- Anti-bot check: a hidden field people never fill in, and a signed render time ----------

const sign = async (value: string) => crypto.createHmac('sha256', await ensureSecret('form_secret')).update(value).digest('hex');

// Put in the form when it is shown.
export async function formToken(now = Date.now()): Promise<string> {
  const ts = String(Math.floor(now / 1000));
  return `${ts}.${await sign(ts)}`;
}

// True when the submission looks like a bot: the hidden field is filled in, the signed time is
// missing or forged, or the form was sent less than MIN_FORM_SECONDS after it was shown.
export async function looksLikeBot(form: FormData, now = Date.now()): Promise<boolean> {
  if (String(form.get('website') ?? '') !== '') return true;
  const [ts, mac] = String(form.get('form_started') ?? '').split('.');
  if (!ts || !mac || !/^\d+$/.test(ts)) return true;
  const expected = Buffer.from(await sign(ts));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return true;
  return now / 1000 - Number(ts) < MIN_FORM_SECONDS;
}

// ---------- Submitting ----------

// Saves the proposals as awaiting confirmation and asks n8n to email a confirmation link.
// Uses the existing account for the email if there is one (without changing its details).
export async function submitAsGuest(guest: GuestDetails, common: CommonValues, picks: { conf: Conference; pick: Choice }[]):
Promise<{ status: 'sent' | 'too_many'; ids: number[] }> {
  guest = { ...guest, email: guest.email.trim().toLowerCase() };
  return transaction(async (db) => {
    // One guest submission at a time per email, so the limit below cannot be raced.
    await query('SELECT pg_advisory_xact_lock(hashtext($1))', [`guest:${guest.email}`], db);
    let user = await one<User>('SELECT * FROM users WHERE lower(email) = $1', [guest.email], db);
    if (user) {
      const awaiting = await one<{ n: number }>('SELECT COUNT(*) AS n FROM proposals WHERE speaker_id = $1 AND awaiting_confirmation', [user.id], db);
      if (awaiting!.n + picks.length > MAX_AWAITING_PER_EMAIL) return { status: 'too_many', ids: [] };
    } else {
      user = await one<User>(`INSERT INTO users (email, password_hash, first_name, last_name, organization, role)
        VALUES ($1, '', $2, $3, $4, 'speaker') RETURNING *`, [guest.email, guest.first_name, guest.last_name, guest.organization], db);
    }
    const ids = await insertProposals(db, user!.id, common, picks, { awaitingConfirmation: true });
    const proposals = await query<{ title: string; conference: string }>(`SELECT p.title, c.name AS conference
      FROM proposals p JOIN conferences c ON c.id = p.conference_id
      WHERE p.speaker_id = $1 AND p.awaiting_confirmation ORDER BY p.id`, [user!.id], db);
    // Earlier confirmation links keep working: any of them confirms everything awaiting.
    await issueLink(db, user!, { purpose: 'confirm_proposal', email: true, proposals, supersede: false });
    return { status: 'sent', ids };
  });
}

// ---------- Confirming ----------

export interface Awaiting { id: number; title: string; conference: string }

export async function awaitingFor(userId: number): Promise<Awaiting[]> {
  return query<Awaiting>(`SELECT p.id, p.title, c.name AS conference FROM proposals p JOIN conferences c ON c.id = p.conference_id
    WHERE p.speaker_id = $1 AND p.awaiting_confirmation ORDER BY p.id`, [userId]);
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

// Confirms every proposal the guest has awaiting confirmation, records the events n8n reacts to,
// and optionally sets a password (claiming the account). One transaction.
export async function confirmWithLink(token: string, password?: string):
Promise<{ user?: User; confirmed?: number[]; passwordSet?: boolean; error?: string }> {
  if (password !== undefined && password.length < 8) return { error: 'Password must be at least 8 characters.' };
  return transaction(async (db) => {
    const link = await one<EmailLink>('SELECT * FROM email_links WHERE token_hash = $1 FOR UPDATE', [sha256(token)], db);
    if (!link || link.purpose !== 'confirm_proposal') return { error: 'This link is not valid.' };
    if (link.used_at) return { error: 'This link has already been used.' };
    if (Date.parse(link.expires_at) <= Date.now()) return { error: 'This link has expired.' };
    let user = (await one<User>('SELECT * FROM users WHERE id = $1 FOR UPDATE', [link.user_id], db))!;
    const firstTime = user.password_hash === '' && !(await one('SELECT 1 FROM proposals WHERE speaker_id = $1 AND NOT awaiting_confirmation', [user.id], db));
    await query('UPDATE email_links SET used_at = now() WHERE id = $1', [link.id], db);
    const confirmed = (await query<{ id: number }>(`UPDATE proposals SET awaiting_confirmation = false, updated_at = now()
      WHERE speaker_id = $1 AND awaiting_confirmation RETURNING id`, [user.id], db)).map((r) => r.id).sort((a, b) => a - b);
    if (password !== undefined) {
      user = (await one<User>('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2 RETURNING *', [hashPassword(password), user.id], db))!;
      await query('DELETE FROM sessions WHERE user_id = $1', [user.id], db);
    }
    if (confirmed.length && firstTime) await recordSpeakerEvent(db, 'speaker.registered', user.id);
    for (const id of confirmed) await recordProposalEvent(db, 'proposal.submitted', id);
    return { user, confirmed, passwordSet: password !== undefined };
  });
}

// ---------- Organisers ----------

export async function awaitingCounts(): Promise<Record<number, number>> {
  const rows = await query<{ conference_id: number; n: number }>(`SELECT conference_id, COUNT(*) AS n FROM proposals
    WHERE awaiting_confirmation GROUP BY conference_id`);
  return Object.fromEntries(rows.map((r) => [r.conference_id, r.n]));
}

// Fallback when a confirmation email does not arrive: a link to copy, no email sent.
export async function copyConfirmationLink(userId: number, organiserId: number): Promise<string | null> {
  return transaction(async (db) => {
    const user = await one<User>('SELECT * FROM users WHERE id = $1', [userId], db);
    if (!user || !(await one('SELECT 1 FROM proposals WHERE speaker_id = $1 AND awaiting_confirmation', [userId], db))) return null;
    return (await issueLink(db, user, { purpose: 'confirm_proposal', email: false, createdBy: organiserId, supersede: false })).url;
  });
}

// ---------- Expiry (run daily by the worker) ----------

// Deletes guest proposals still unconfirmed after 6 months, then guest accounts left with nothing:
// no password, no proposals, no committee place and no link still waiting to be used.
export async function purgeExpiredGuests(): Promise<{ proposals: number; accounts: number }> {
  return transaction(async (db) => {
    const proposals = await query(`DELETE FROM proposals WHERE awaiting_confirmation AND submitted_at < now() - interval '${GUEST_EXPIRY}' RETURNING id`, [], db);
    const accounts = await query(`DELETE FROM users u WHERE u.password_hash = '' AND u.role = 'speaker'
      AND NOT EXISTS (SELECT 1 FROM proposals p WHERE p.speaker_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM conference_reviewers r WHERE r.user_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM email_links l WHERE l.user_id = u.id AND l.used_at IS NULL AND l.expires_at > now())
      AND u.created_at < now() - interval '${GUEST_EXPIRY}'
      RETURNING u.id`, [], db);
    return { proposals: proposals.length, accounts: accounts.length };
  });
}

// Single-use links sent by email (through n8n): password resets and committee invites.
// A link is <BASE_URL>/link/<token>; only sha256(token) is stored. Opening a link never uses it up:
// only submitting the form on its page does, so email scanners that pre-open links cannot burn them.
import crypto from 'node:crypto';
import type pg from 'pg';
import { one, query, transaction } from './db';
import { hashPassword, type User } from './auth';
import { recordEvent } from './events';
import { baseUrl } from './links';

export const LINK_PURPOSES = ['password_reset', 'committee_invite', 'confirm_proposal', 'claim_account'] as const;
export type LinkPurpose = (typeof LINK_PURPOSES)[number];

const HOUR_MS = 3_600_000;
export const LINK_LIFETIME_MS: Record<LinkPurpose, number> = {
  password_reset: 24 * HOUR_MS,
  committee_invite: 7 * 24 * HOUR_MS,
  confirm_proposal: 183 * 24 * HOUR_MS, // 6 months, as long as unconfirmed guest proposals are kept
  claim_account: 7 * 24 * HOUR_MS,
};

// At most this many password links per email address per hour through the forgot password form.
export const RESET_LIMIT_PER_HOUR = 3;

export interface EmailLink {
  id: number;
  user_id: number;
  purpose: LinkPurpose;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_by: number | null;
  created_at: string;
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const linkUrl = (token: string) => `${baseUrl()}/link/${token}`;

export interface IssueOptions {
  purpose: LinkPurpose;
  // true: record email_link.requested so n8n emails it. false: the organiser copies it instead.
  email: boolean;
  createdBy?: number | null;
  conference?: { name: string; slug: string } | null;
  // confirm_proposal: what the guest is confirming, for the email.
  proposals?: { title: string; conference: string }[] | null;
  // false keeps earlier unused links working (a guest's older confirmation links still confirm everything).
  supersede?: boolean;
  // A different lifetime from the purpose's default (bulk claim emails at cutover last 30 days).
  lifetimeMs?: number;
  // Marks links sent by a bulk action, e.g. 'import-claim'.
  batch?: string | null;
}

// Issues a link for `user`, inside the caller's transaction. Earlier unused links for the same
// person and purpose stop working. Returns the full URL (shown or emailed once, never stored).
export async function issueLink(db: pg.PoolClient, user: Pick<User, 'id' | 'name' | 'first_name' | 'email'>, opts: IssueOptions) {
  if (opts.supersede !== false) await query(`UPDATE email_links SET used_at = now()
               WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()`, [user.id, opts.purpose], db);
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + (opts.lifetimeMs ?? LINK_LIFETIME_MS[opts.purpose]));
  await query(`INSERT INTO email_links (user_id, purpose, token_hash, expires_at, created_by, batch) VALUES ($1, $2, $3, $4, $5, $6)`,
    [user.id, opts.purpose, sha256(token), expires, opts.createdBy ?? null, opts.batch ?? null], db);
  const url = linkUrl(token);
  const expiresAt = expires.toISOString().replace(/\.\d{3}Z$/, 'Z');
  if (opts.email) {
    await recordEvent(db, 'email_link.requested', {
      purpose: opts.purpose,
      url,
      expires_at: expiresAt,
      recipient: { id: user.id, name: user.name, first_name: user.first_name, email: user.email },
      conference: opts.conference ?? null,
      proposals: opts.proposals ?? null,
    });
  }
  return { url, expiresAt };
}

export type LinkState = 'valid' | 'used' | 'expired' | 'invalid';

export async function lookupLink(token: string): Promise<{ state: LinkState; link?: EmailLink; user?: User }> {
  if (!/^[\w-]{20,100}$/.test(token)) return { state: 'invalid' };
  const link = await one<EmailLink>('SELECT * FROM email_links WHERE token_hash = $1', [sha256(token)]);
  if (!link) return { state: 'invalid' };
  const user = (await one<User>('SELECT * FROM users WHERE id = $1', [link.user_id]))!;
  if (link.used_at) return { state: 'used', link, user };
  if (Date.parse(link.expires_at) <= Date.now()) return { state: 'expired', link, user };
  return { state: 'valid', link, user };
}

// Uses a link to set a password: one transaction that locks the link, checks it, sets the password,
// marks the link used and signs out every session of that person. The caller then starts a new session.
export async function setPasswordWithLink(token: string, password: string): Promise<{ user?: User; purpose?: LinkPurpose; error?: string }> {
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' };
  if (!/^[\w-]{20,100}$/.test(token)) return { error: 'This link is not valid.' };
  return transaction(async (db) => {
    const link = await one<EmailLink>('SELECT * FROM email_links WHERE token_hash = $1 FOR UPDATE', [sha256(token)], db);
    if (!link) return { error: 'This link is not valid.' };
    if (link.used_at) return { error: 'This link has already been used.' };
    if (Date.parse(link.expires_at) <= Date.now()) return { error: 'This link has expired.' };
    if (link.purpose === 'confirm_proposal') return { error: 'This link confirms a proposal. Open it again to confirm.' };
    const user = await one<User>('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2 RETURNING *',
      [hashPassword(password), link.user_id], db);
    await query('UPDATE email_links SET used_at = now() WHERE id = $1', [link.id], db);
    await query('DELETE FROM sessions WHERE user_id = $1', [link.user_id], db);
    return { user: user!, purpose: link.purpose };
  });
}

// A guest (a speaker who has never set a password) gets a "claim your account" link; everyone else a reset.
export const passwordPurpose = (user: Pick<User, 'password_hash' | 'role'>): LinkPurpose =>
  (user.password_hash === '' && user.role === 'speaker' ? 'claim_account' : 'password_reset');

// Forgot password (and registering with a guest's email). Always resolves the same way for the
// caller; returns true only for tests and logs.
export async function requestPasswordReset(email: string): Promise<boolean> {
  const user = await one<User>('SELECT * FROM users WHERE lower(email) = lower($1)', [email.trim()]);
  if (!user) return false;
  const recent = await one<{ n: number }>(`SELECT COUNT(*) AS n FROM email_links
    WHERE user_id = $1 AND purpose IN ('password_reset', 'claim_account') AND created_by IS NULL
      AND created_at > now() - interval '1 hour'`, [user.id]);
  if (recent!.n >= RESET_LIMIT_PER_HOUR) return false;
  await transaction((db) => issueLink(db, user, { purpose: passwordPurpose(user), email: true }));
  return true;
}

// Organiser fallback: a password link to copy, without an email being sent.
export async function copyPasswordLink(userId: number, organiserId: number): Promise<string | null> {
  return transaction(async (db) => {
    const user = await one<User>('SELECT * FROM users WHERE id = $1', [userId], db);
    if (!user) return null;
    return (await issueLink(db, user, { purpose: passwordPurpose(user), email: false, createdBy: organiserId })).url;
  });
}

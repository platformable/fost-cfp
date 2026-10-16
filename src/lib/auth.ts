import crypto from 'node:crypto';
import { one, query } from './db';

export type Role = 'speaker' | 'reviewer' | 'admin';

export interface User {
  id: number;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  name: string;
  role: Role;
  organization: string;
  job_title: string;
  bio: string;
  linkedin_profile_url: string;
  phone: string;
  country: string;
  photo_url: string;
  created_at: string;
  updated_at: string;
}

export const SESSION_COOKIE = 'fost_session';
export const SESSION_DAYS = 14;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

// Creates a session and returns the token for the cookie. Only its hash is stored.
export async function createSession(userId: number): Promise<{ token: string; expires: Date }> {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  await query('INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)', [sha256(token), userId, expires]);
  return { token, expires };
}

export async function userForSession(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  return one<User>(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
                    WHERE s.id = $1 AND s.expires_at > now()`, [sha256(token)]);
}

export async function deleteSession(token: string | undefined): Promise<void> {
  if (token) await query('DELETE FROM sessions WHERE id = $1', [sha256(token)]);
}

export async function findUserByEmail(email: string): Promise<User | null> {
  return one<User>('SELECT * FROM users WHERE lower(email) = lower($1)', [email.trim()]);
}

export async function login(email: string, password: string): Promise<User | null> {
  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) return null;
  return user;
}

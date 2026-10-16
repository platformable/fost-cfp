import { one, query } from './db';
import { findUserByEmail, hashPassword, verifyPassword, type Role, type User } from './auth';
import { isCountryCode } from './countries';
import { safeUrl } from './format';

export const PROFILE_FIELDS = ['first_name', 'last_name', 'organization', 'job_title', 'bio', 'linkedin_profile_url', 'phone', 'country', 'photo_url'] as const;
export type ProfileValues = Record<(typeof PROFILE_FIELDS)[number], string>;

export interface RegisterValues { first_name: string; last_name: string; email: string; organization: string }

// The very first account becomes the organiser (admin), so a fresh install can be set up from the browser.
export async function register(values: RegisterValues, password: string): Promise<{ user?: User; error?: string }> {
  if (!values.first_name) return { error: 'Please enter your first name.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) return { error: 'Please enter a valid email address.' };
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' };
  if (await findUserByEmail(values.email)) return { error: 'An account with that email already exists. Try signing in.' };
  const user = await one<User>(`
    INSERT INTO users (email, password_hash, first_name, last_name, organization, role)
    VALUES ($1, $2, $3, $4, $5, CASE WHEN EXISTS (SELECT 1 FROM users) THEN 'speaker' ELSE 'admin' END)
    RETURNING *`, [values.email.toLowerCase(), hashPassword(password), values.first_name, values.last_name, values.organization]);
  return { user: user! };
}

// Returns an https linkedin.com URL, or null if the value isn't a LinkedIn address.
export function normalizeLinkedIn(value: string): string | null {
  const url = safeUrl(value);
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
    u.protocol = 'https:';
    return u.toString();
  } catch {
    return null;
  }
}

export function readProfile(form: FormData): { values: ProfileValues; error: string | null } {
  const values = Object.fromEntries(PROFILE_FIELDS.map((f) => [f, String(form.get(f) ?? '').trim()])) as ProfileValues;
  let error: string | null = null;
  if (!values.first_name) error = 'First name is required.';
  else if (values.country && !isCountryCode(values.country)) error = 'Please choose a country from the list.';
  else if (values.linkedin_profile_url) {
    const url = normalizeLinkedIn(values.linkedin_profile_url);
    if (url === null) error = 'LinkedIn profile URL must be a linkedin.com address, like https://www.linkedin.com/in/your-name.';
    else values.linkedin_profile_url = url;
  }
  return { values, error };
}

export async function saveProfile(userId: number, values: ProfileValues): Promise<void> {
  await query(`UPDATE users SET ${PROFILE_FIELDS.map((f, i) => `${f} = $${i + 1}`).join(', ')}, updated_at = now()
               WHERE id = $${PROFILE_FIELDS.length + 1}`, [...PROFILE_FIELDS.map((f) => values[f]), userId]);
  // Touch the speaker's proposals so "updated since" exports pick up the new speaker details.
  await query('UPDATE proposals SET updated_at = now() WHERE speaker_id = $1', [userId]);
}

export async function changePassword(user: User, current: string, next: string): Promise<string | null> {
  if (!verifyPassword(current, user.password_hash)) return 'Current password is incorrect.';
  if (next.length < 8) return 'New password must be at least 8 characters.';
  await query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [hashPassword(next), user.id]);
  return null;
}

export async function listUsers(search: string) {
  const q = `%${search.trim()}%`;
  return query<User & { proposal_count: number }>(`
    SELECT u.*, (SELECT COUNT(*) FROM proposals p WHERE p.speaker_id = u.id) AS proposal_count
    FROM users u
    WHERE $1 = '%%' OR u.name ILIKE $1 OR u.email ILIKE $1 OR u.organization ILIKE $1
    ORDER BY u.created_at DESC LIMIT 500`, [q]);
}

export async function setRole(userId: number, role: Role): Promise<void> {
  await query('UPDATE users SET role = $1, updated_at = now() WHERE id = $2', [role, userId]);
  if (role === 'speaker') await query('DELETE FROM conference_reviewers WHERE user_id = $1', [userId]);
}

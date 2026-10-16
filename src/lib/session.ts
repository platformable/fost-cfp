// Request-bound helpers: the signed-in user, access guards and one-off flash messages.
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, createSession, deleteSession, userForSession, type Role, type User } from './auth';

export const currentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return userForSession(token);
});

export async function startSession(userId: number): Promise<void> {
  const { token, expires } = await createSession(userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && !process.env.ALLOW_INSECURE_COOKIES,
    path: '/',
    expires,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  await deleteSession(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
}

// Sends signed-out visitors to the sign-in page, then back to `returnTo`.
export async function requireUser(returnTo = '/'): Promise<User> {
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return user;
}

export async function requireRole(roles: Role[], returnTo = '/'): Promise<User> {
  const user = await requireUser(returnTo);
  if (!roles.includes(user.role)) redirect('/forbidden');
  return user;
}

// Only same-site paths are allowed as a post-login destination.
export const safeNext = (next: unknown, fallback: string) => {
  const s = String(next ?? '');
  return s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') ? s : fallback;
};

export type FlashType = 'success' | 'error' | 'info';
export interface Flash { id: string; type: FlashType; message: string }
export const FLASH_COOKIE = 'fost_flash';

export async function flash(type: FlashType, message: string): Promise<void> {
  const value: Flash = { id: Math.random().toString(36).slice(2), type, message };
  (await cookies()).set(FLASH_COOKIE, encodeURIComponent(JSON.stringify(value)), { path: '/', maxAge: 60, sameSite: 'lax' });
}

export async function readFlash(): Promise<Flash | null> {
  const raw = (await cookies()).get(FLASH_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as Flash;
  } catch {
    return null;
  }
}

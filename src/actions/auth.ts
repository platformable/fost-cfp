'use server';

import { redirect } from 'next/navigation';
import { login } from '@/lib/auth';
import { register } from '@/lib/users';
import { endSession, flash, safeNext, startSession } from '@/lib/session';

export interface AuthState { error?: string; values?: Record<string, string> }

export async function loginAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get('email') ?? '').trim();
  const user = await login(email, String(form.get('password') ?? ''));
  if (!user) return { error: 'Incorrect email or password.', values: { email } };
  await startSession(user.id);
  const home = user.role === 'admin' ? '/admin' : user.role === 'reviewer' ? '/review' : '/proposals';
  redirect(safeNext(form.get('next'), home));
}

export async function registerAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const values = {
    first_name: String(form.get('first_name') ?? '').trim(),
    last_name: String(form.get('last_name') ?? '').trim(),
    email: String(form.get('email') ?? '').trim().toLowerCase(),
    organization: String(form.get('organization') ?? '').trim(),
  };
  const { user, error } = await register(values, String(form.get('password') ?? ''));
  if (!user) return { error, values };
  await startSession(user.id);
  const isAdmin = user.role === 'admin';
  await flash('success', isAdmin
    ? 'Welcome! As the first user you are the organiser (admin). Create your first conference below.'
    : 'Welcome! Complete your speaker profile, then submit a proposal.');
  redirect(isAdmin ? '/admin' : safeNext(form.get('next'), '/profile'));
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect('/');
}

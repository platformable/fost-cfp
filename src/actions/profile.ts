'use server';

import { revalidatePath } from 'next/cache';
import { changePassword, readProfile, saveProfile } from '@/lib/users';
import { requireUser } from '@/lib/session';

export interface ProfileState { error?: string; ok?: string; values?: Record<string, string>; at?: number }

export async function saveProfileAction(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const user = await requireUser('/profile');
  const { values, error } = readProfile(form);
  if (error) return { error, values };
  await saveProfile(user.id, values);
  revalidatePath('/', 'layout');
  return { ok: 'Profile saved.', values, at: Date.now() };
}

export async function changePasswordAction(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const user = await requireUser('/profile');
  const error = await changePassword(user, String(form.get('current_password') ?? ''), String(form.get('new_password') ?? ''));
  return error ? { error, at: Date.now() } : { ok: 'Password changed.', at: Date.now() };
}

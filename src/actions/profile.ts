'use server';

import { revalidatePath } from 'next/cache';
import { changePassword, readProfile, saveProfile } from '@/lib/users';
import { requireUser } from '@/lib/session';

export interface ProfileState { error?: string; ok?: string; values?: Record<string, string>; at?: number }

export async function saveProfileAction(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const user = await requireUser('/profile');
  const { values, error } = readProfile(form);
  // The form shows every answer as text; gender and MC interest are stored as a choice and a yes/no.
  const shown: Record<string, string> = {
    ...Object.fromEntries(Object.entries(values).filter(([, v]) => typeof v === 'string')) as Record<string, string>,
    gender: values.gender ?? '',
    mc_interest: values.mc_interest === true ? 'yes' : values.mc_interest === false ? 'no' : '',
  };
  if (error) return { error, values: shown };
  await saveProfile(user.id, values);
  revalidatePath('/', 'layout');
  return { ok: 'Profile saved.', values: shown, at: Date.now() };
}

export async function changePasswordAction(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const user = await requireUser('/profile');
  const error = await changePassword(user, String(form.get('current_password') ?? ''), String(form.get('new_password') ?? ''));
  return error ? { error, at: Date.now() } : { ok: 'Password changed.', at: Date.now() };
}

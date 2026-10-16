'use server';

import crypto from 'node:crypto';
import { redirect } from 'next/navigation';
import { addReviewer, readConferenceForm, removeReviewer, saveConference, setConferenceFlag } from '@/lib/conferences';
import { setSetting } from '@/lib/db';
import { setRole } from '@/lib/users';
import { flash, requireRole } from '@/lib/session';
import type { Role } from '@/lib/auth';

export interface ConferenceFormState { errors?: string[]; values?: Record<string, unknown> }

export async function saveConferenceAction(id: number | null, _prev: ConferenceFormState, form: FormData): Promise<ConferenceFormState> {
  await requireRole(['admin']);
  const { values, errors } = readConferenceForm(form);
  if (errors.length) return { errors, values };
  const saved = await saveConference(values, id ?? undefined);
  if (saved.errors.length) return { errors: saved.errors, values };
  await flash('success', id ? 'Conference saved.' : 'Conference created. Add program committee members below.');
  redirect(`/admin/conferences/${saved.id}`);
}

export async function conferenceFlagAction(id: number, form: FormData): Promise<void> {
  await requireRole(['admin']);
  const flag = String(form.get('flag'));
  if (flag !== 'decisions_published' && flag !== 'archived') redirect(`/admin/conferences/${id}`);
  const value = form.get('value') === '1';
  await setConferenceFlag(id, flag, value);
  const messages = {
    decisions_published: value ? 'Decisions are now visible to speakers. Accepted speakers can confirm their slot.' : 'Decisions hidden from speakers.',
    archived: value ? 'Conference archived.' : 'Conference restored.',
  };
  await flash('success', messages[flag]);
  redirect(`/admin/conferences/${id}`);
}

export async function addReviewerAction(id: number, form: FormData): Promise<void> {
  await requireRole(['admin']);
  const email = String(form.get('email') ?? '').trim();
  const result = await addReviewer(id, email);
  await flash(result.error ? 'error' : 'success', result.error ?? `${result.name} added to the program committee.`);
  redirect(`/admin/conferences/${id}#committee`);
}

export async function removeReviewerAction(id: number, userId: number): Promise<void> {
  await requireRole(['admin']);
  await removeReviewer(id, userId);
  await flash('success', 'Removed from the program committee.');
  redirect(`/admin/conferences/${id}#committee`);
}

export async function setRoleAction(userId: number, form: FormData): Promise<void> {
  const me = await requireRole(['admin']);
  const role = String(form.get('role')) as Role;
  if (!['speaker', 'reviewer', 'admin'].includes(role)) redirect('/admin/users');
  if (userId === me.id && role !== 'admin') {
    await flash('error', 'You cannot remove your own admin access.');
    redirect('/admin/users');
  }
  await setRole(userId, role);
  await flash('success', 'Role updated.');
  redirect('/admin/users');
}

export async function rotateExportTokenAction(): Promise<void> {
  await requireRole(['admin']);
  await setSetting('export_token', crypto.randomBytes(24).toString('hex'));
  await flash('success', 'Export token regenerated. Update any automations that use the old links.');
  redirect('/admin/exports');
}

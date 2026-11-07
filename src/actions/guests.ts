'use server';

import { redirect } from 'next/navigation';
import { confirmWithLink, copyConfirmationLink } from '@/lib/guests';
import { flash, requireRole, startSession } from '@/lib/session';

export interface ConfirmState { error?: string; confirmed?: number }

export async function confirmProposalAction(token: string, _prev: ConfirmState, form: FormData): Promise<ConfirmState> {
  const wantsPassword = form.get('set_password') === '1';
  const password = String(form.get('password') ?? '');
  if (wantsPassword && password !== String(form.get('password_again') ?? '')) return { error: 'The two passwords do not match.' };
  const result = await confirmWithLink(token, wantsPassword ? password : undefined);
  if (result.error) return { error: result.error };
  const n = result.confirmed!.length;
  if (result.passwordSet) {
    await startSession(result.user!.id);
    await flash('success', `Thank you: ${n === 1 ? 'your proposal is' : `your ${n} proposals are`} confirmed, your password is set and you are signed in.`);
    redirect('/proposals');
  }
  return { confirmed: n };
}

// Organiser fallback when a confirmation email does not arrive.
export async function copyConfirmationLinkAction(userId: number): Promise<{ url?: string; error?: string }> {
  const me = await requireRole(['admin']);
  const url = await copyConfirmationLink(userId, me.id);
  return url ? { url } : { error: 'Nothing is waiting for confirmation for this person.' };
}

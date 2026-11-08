'use server';

import { redirect } from 'next/navigation';
import {
  discardBatch, getBatch, readTypeformExport, resolveTopicException, runBatch, sendClaimEmails, type ConferenceMap, type ExceptionChoice,
} from '@/lib/imports';
import { flash, requireRole } from '@/lib/session';

// The mapping chosen on the preview page: one select per Typeform conference column, named m0, m1, …
async function mapFromForm(batchId: number, form: FormData): Promise<ConferenceMap | null> {
  const batch = await getBatch(batchId);
  if (!batch?.content) return null;
  const { conferenceLabels } = readTypeformExport(batch.content);
  const map: ConferenceMap = {};
  conferenceLabels.forEach((label, i) => {
    const v = String(form.get(`m${i}`) ?? '');
    if (v === 'skip') map[label] = null;
    else if (/^\d+$/.test(v)) map[label] = Number(v);
  });
  return map;
}

export async function runImportAction(batchId: number, form: FormData): Promise<void> {
  await requireRole(['admin']);
  const map = await mapFromForm(batchId, form);
  if (!map) {
    await flash('error', 'This upload has already been imported or discarded.');
    redirect('/admin/import');
  }
  const result = await runBatch(batchId, map);
  if (result.error) {
    await flash('error', result.error);
    redirect(`/admin/import/${batchId}?${new URLSearchParams(Object.fromEntries([...form.entries()].filter(([k]) => /^m\d+$/.test(k)).map(([k, v]) => [k, String(v)]))).toString()}`);
  }
  const c = result.counts!;
  await flash('success', `Imported ${c.proposals} proposal${c.proposals === 1 ? '' : 's'} (${c.new_speakers} new speaker${c.new_speakers === 1 ? '' : 's'}). `
    + `${c.topic_exceptions ? `${c.topic_exceptions} need a topic choosing. ` : ''}${c.already_imported ? `${c.already_imported} responses were already imported. ` : ''}Nobody has been emailed.`);
  redirect(c.topic_exceptions ? '/admin/import/exceptions' : '/admin/import');
}

export async function discardImportAction(batchId: number): Promise<void> {
  await requireRole(['admin']);
  await discardBatch(batchId);
  await flash('success', 'Upload discarded. Nothing was imported.');
  redirect('/admin/import');
}

export async function resolveExceptionAction(proposalId: number, form: FormData): Promise<void> {
  const me = await requireRole(['admin']);
  const v = String(form.get('choice') ?? '');
  const choice: ExceptionChoice | null = v === 'none' ? { kind: 'none' }
    : v.startsWith('use:') ? { kind: 'use', topic: v.slice(4) }
      : v.startsWith('add:') ? { kind: 'add', topic: v.slice(4) } : null;
  if (!choice) {
    await flash('error', 'Choose what to do with this proposal.');
    redirect('/admin/import/exceptions');
  }
  const error = await resolveTopicException(proposalId, choice, me.id);
  await flash(error ? 'error' : 'success', error ?? 'Topic saved.');
  redirect('/admin/import/exceptions');
}

export async function sendClaimEmailsAction(form: FormData): Promise<void> {
  const me = await requireRole(['admin']);
  const n = await sendClaimEmails(me.id, form.get('resend') === '1');
  await flash('success', n
    ? `Claim links queued for ${n} imported guest${n === 1 ? '' : 's'}. n8n sends the emails; each link lasts 30 days.`
    : 'Nobody to email: every imported guest has claimed their account or was already sent a link.');
  redirect('/admin/import#claim');
}

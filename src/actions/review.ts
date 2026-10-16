'use server';

import { redirect } from 'next/navigation';
import { getConference, isReviewerFor } from '@/lib/conferences';
import { DECISIONS, RECOMMENDATIONS, bulkDecide, decide, getProposal, saveReview } from '@/lib/proposals';
import { flash, requireRole } from '@/lib/session';

async function reviewable(id: number, roles: ('reviewer' | 'admin')[] = ['reviewer', 'admin']) {
  const user = await requireRole(roles, `/review/proposals/${id}`);
  const p = await getProposal(id);
  if (!p || !(await isReviewerFor(user, p.conference_id))) redirect('/review');
  return { user, p };
}

export async function saveReviewAction(id: number, form: FormData): Promise<void> {
  const { user, p } = await reviewable(id);
  if (p.speaker_id === user.id) {
    await flash('error', 'You cannot review your own proposal.');
    redirect(`/review/proposals/${id}`);
  }
  const score = Number(form.get('score'));
  const recommendation = String(form.get('recommendation') ?? '');
  if (!Number.isInteger(score) || score < 1 || score > 5 || !(RECOMMENDATIONS as readonly string[]).includes(recommendation)) {
    await flash('error', 'Please give a score from 1 to 5 and a recommendation.');
    redirect(`/review/proposals/${id}`);
  }
  await saveReview(p.id, user.id, score, recommendation, String(form.get('comments') ?? '').trim());
  await flash('success', 'Review saved.');
  const next = String(form.get('next') ?? '');
  redirect(/^\d+$/.test(next) ? `/review/proposals/${next}` : `/review/proposals/${id}`);
}

export async function decisionAction(id: number, form: FormData): Promise<void> {
  const { user, p } = await reviewable(id, ['admin']);
  const status = String(form.get('status') ?? '');
  if (p.status === 'withdrawn' || !(DECISIONS as readonly string[]).includes(status)) {
    await flash('error', p.status === 'withdrawn' ? 'This proposal was withdrawn by the speaker.' : 'Choose a valid decision.');
    redirect(`/review/proposals/${id}`);
  }
  const conf = (await getConference(p.conference_id))!;
  const extra: Record<string, string> = {
    feedback_to_speaker: String(form.get('feedback_to_speaker') ?? '').trim(),
    internal_notes: String(form.get('internal_notes') ?? '').trim(),
  };
  // Speakers choose the topic when they submit; organisers can change it here.
  if (form.has('topic')) {
    const topic = String(form.get('topic') ?? '');
    if (topic && topic !== p.topic && !conf.topicList.includes(topic)) {
      await flash('error', "Choose one of the conference's topics.");
      redirect(`/review/proposals/${id}`);
    }
    extra.topic = topic;
  }
  await decide(p, user.id, status, extra);
  await flash('success', 'Decision saved.');
  redirect(`/review/proposals/${id}`);
}

export async function bulkDecisionAction(conferenceId: number, form: FormData): Promise<void> {
  const user = await requireRole(['admin']);
  const status = String(form.get('status') ?? '');
  const ids = form.getAll('ids').map(Number).filter(Number.isInteger);
  const back = String(form.get('return_to') ?? '');
  if (!(DECISIONS as readonly string[]).includes(status) || !ids.length) {
    await flash('error', 'Select at least one proposal and a decision.');
  } else {
    const n = await bulkDecide(conferenceId, ids, status, user.id);
    await flash('success', `Updated ${n} proposal${n === 1 ? '' : 's'}.`);
  }
  redirect(back.startsWith(`/review/conferences/${conferenceId}`) ? back : `/review/conferences/${conferenceId}`);
}

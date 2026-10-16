'use server';

import { redirect } from 'next/navigation';
import { getConference, openConferences, type Conference } from '@/lib/conferences';
import {
  canSpeakerEdit, confirmSlot, editDeadline, getProposal, readCommon, readConferenceChoice, submitProposals,
  updateBySpeaker, withdraw, type Choice,
} from '@/lib/proposals';
import { formatDate } from '@/lib/format';
import { flash, requireUser } from '@/lib/session';

export interface ProposalFormState {
  errors?: string[];
  values?: Record<string, string>;
  selected?: number[];
  picks?: Record<number, Choice>;
}

export async function submitProposalAction(_prev: ProposalFormState, form: FormData): Promise<ProposalFormState> {
  const user = await requireUser('/proposals/new');
  const ids = [...new Set(form.getAll('conference_ids').map(Number).filter(Number.isInteger))];
  const confs = (await Promise.all(ids.map((id) => getConference(id)))).filter((c): c is Conference => !!c);
  const chosen = confs.filter((c) => c.cfpOpen);
  const closed = confs.filter((c) => !c.cfpOpen);

  const { values, errors } = readCommon(form);
  const picks: Record<number, Choice> = {};
  if (!chosen.length) errors.unshift(closed.length ? 'That conference is no longer accepting proposals.' : 'Choose at least one conference to submit to.');
  for (const c of closed) errors.push(`${c.name} is no longer accepting proposals.`);
  for (const conf of chosen) {
    const r = readConferenceChoice(form, conf, { named: chosen.length > 1 });
    picks[conf.id] = r.pick;
    errors.push(...r.errors);
  }
  if (errors.length) return { errors, values, selected: chosen.map((c) => c.id), picks };

  const newIds = await submitProposals(user.id, values, chosen.map((conf) => ({ conf, pick: picks[conf.id] })));
  if (chosen.length === 1) {
    const deadline = editDeadline(chosen[0]);
    await flash('success', `Thanks! Your proposal has been submitted. You can keep editing it${deadline ? ` until ${formatDate(deadline)}, the day before the conference` : ''}.`);
    redirect(`/proposals/${newIds[0]}`);
  }
  await flash('success', `Thanks! Your proposal has been submitted to ${chosen.length} conferences: ${chosen.map((c) => c.name).join(', ')}. Each one is reviewed separately, and you can edit each one on its own.`);
  redirect('/proposals');
}

async function ownProposal(id: number, userId: number) {
  const p = await getProposal(id);
  if (!p || p.speaker_id !== userId) redirect('/proposals');
  const conf = (await getConference(p.conference_id))!;
  return { p, conf };
}

export async function editProposalAction(id: number, _prev: ProposalFormState, form: FormData): Promise<ProposalFormState> {
  const user = await requireUser(`/proposals/${id}/edit`);
  const { p, conf } = await ownProposal(id, user.id);
  if (!canSpeakerEdit(p, conf)) {
    await flash('error', 'This proposal can no longer be edited.');
    redirect(`/proposals/${id}`);
  }
  const common = readCommon(form);
  const choice = readConferenceChoice(form, conf, { current: { format: p.format, topic: p.topic } });
  const errors = [...common.errors, ...choice.errors];
  if (errors.length) return { errors, values: common.values, selected: [conf.id], picks: { [conf.id]: choice.pick } };
  const changed = await updateBySpeaker(p, user.id, { ...common.values, ...choice.pick });
  await flash(changed.length ? 'success' : 'info', changed.length ? 'Proposal updated.' : 'No changes to save.');
  redirect(`/proposals/${id}`);
}

export async function withdrawAction(id: number): Promise<void> {
  const user = await requireUser();
  const { p } = await ownProposal(id, user.id);
  await withdraw(p, user.id);
  await flash('success', 'Your proposal has been withdrawn.');
  redirect(`/proposals/${id}`);
}

export async function confirmAction(id: number, form: FormData): Promise<void> {
  const user = await requireUser();
  const { p, conf } = await ownProposal(id, user.id);
  const answer = form.get('answer') === 'decline' ? 'declined' : 'confirmed';
  if (p.status !== 'accepted' || !conf.decisions_published) {
    await flash('error', 'Only accepted proposals can be confirmed.');
    redirect(`/proposals/${id}`);
  }
  await confirmSlot(p, user.id, answer);
  await flash('success', answer === 'confirmed'
    ? 'Thank you for confirming! The organisers will be in touch with next steps.'
    : 'You have declined this speaking slot. The organisers have been notified.');
  redirect(`/proposals/${id}`);
}

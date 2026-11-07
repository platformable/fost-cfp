'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import type { ProposalFormState } from '@/actions/proposals';
import { SubmitButton } from './SubmitButton';
import { Errors } from './ui';

export interface FormConference {
  id: number;
  name: string;
  details: string;
  formatList: string[];
  topicList: string[];
  blind_review: boolean;
}

interface Props {
  mode: 'new' | 'edit';
  action: (state: ProposalFormState, form: FormData) => Promise<ProposalFormState>;
  conferences: FormConference[];
  levels: string[];
  initial: Required<Pick<ProposalFormState, 'values' | 'selected' | 'picks'>>;
  cancelHref: string;
  // Signed-out visitors: show "About you" and the anti-bot fields (the signed time the form was shown).
  guest?: { formStarted: string } | null;
}

// Write a proposal once and send it to one or more conferences, choosing a format and topic for each.
export function ProposalForm({ mode, action, conferences, levels, initial, cancelHref, guest }: Props) {
  const [state, formAction] = useActionState(action, initial);
  const [selected, setSelected] = useState<number[]>(initial.selected);
  // After a failed submit, keep the conferences that were ticked.
  useEffect(() => { if (state.selected) setSelected(state.selected); }, [state]);
  const editing = mode === 'edit';
  const values = state.values ?? initial.values;
  const picks = state.picks ?? initial.picks;
  const count = editing ? 1 : selected.length;
  const anonymous = conferences.some((c) => c.blind_review && (editing || selected.includes(c.id)));

  const toggle = (id: number, on: boolean) =>
    setSelected((s) => (on ? [...new Set([...s, id])] : s.filter((x) => x !== id)));

  return (
    <>
      {anonymous && <div className="flash flash-info">At least one conference you chose uses anonymous review. Please leave your name and employer out of the title and abstract.</div>}
      <Errors errors={state.errors} />
      <section className="card">
        <form action={formAction} className="form" key={JSON.stringify(state.errors ?? [])}
          onSubmit={(e) => {
            if (!editing && !selected.length) {
              e.preventDefault();
              window.alert('Choose at least one conference to submit to.');
            }
          }}>
          {guest && (
            <fieldset className="conf-picks">
              <legend>About you</legend>
              <p className="small muted">No account needed. We will email you a link to confirm your proposal; it only counts once you confirm.
                Already have an account? <Link href="/login?next=/proposals/new">Sign in</Link> instead.</p>
              <div className="field-row">
                <label>First name <input name="guest_first_name" defaultValue={values.guest_first_name} required autoComplete="given-name" /></label>
                <label>Last name <input name="guest_last_name" defaultValue={values.guest_last_name} autoComplete="family-name" /></label>
              </div>
              <div className="field-row">
                <label>Email <input type="email" name="guest_email" defaultValue={values.guest_email} required autoComplete="email" /></label>
                <label>Organisation <span className="opt">optional</span> <input name="guest_organization" defaultValue={values.guest_organization} autoComplete="organization" /></label>
              </div>
              <input type="hidden" name="form_started" value={guest.formStarted} />
              {/* Left empty by people; bots fill it in. */}
              <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
                <label>Website <input name="website" tabIndex={-1} autoComplete="off" defaultValue="" /></label>
              </div>
            </fieldset>
          )}
          <fieldset className="conf-picks">
            <legend>{editing ? 'Conference' : 'Conferences'}</legend>
            {!editing && <p className="small muted">Tick every conference you want to speak at, then choose a session format and topic for each.</p>}
            {conferences.map((c) => {
              const on = editing || selected.includes(c.id);
              const pick = picks[c.id] ?? { format: '', topic: '' };
              const formats = pick.format && !c.formatList.includes(pick.format) ? [...c.formatList, pick.format] : c.formatList;
              const topics = pick.topic && !c.topicList.includes(pick.topic) ? [...c.topicList, pick.topic] : c.topicList;
              return (
                <div className={`conf-pick${on ? ' on' : ''}`} key={c.id}>
                  {editing ? (
                    <>
                      <input type="hidden" name="conference_ids" value={c.id} />
                      <div className="conf-pick-head"><strong>{c.name}</strong></div>
                    </>
                  ) : (
                    <label className="check conf-pick-head">
                      <input type="checkbox" name="conference_ids" value={c.id} checked={on} onChange={(e) => toggle(c.id, e.target.checked)} />
                      <span><strong>{c.name}</strong><br /><span className="small muted">{c.details}</span></span>
                    </label>
                  )}
                  {on && (
                    <div className="field-row conf-fields">
                      <label>Session format
                        <select name={`format_${c.id}`} defaultValue={pick.format} required>
                          <option value="">Choose…</option>
                          {formats.map((f) => <option key={f}>{f}</option>)}
                        </select></label>
                      {topics.length > 0 && (
                        <label>Topic
                          <select name={`topic_${c.id}`} defaultValue={pick.topic} required>
                            <option value="">Choose…</option>
                            {topics.map((t) => <option key={t}>{t}</option>)}
                          </select></label>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </fieldset>

          <label>Title <input name="title" defaultValue={values.title} maxLength={200} required /></label>
          <label>Abstract <span className="opt">public description shown in the program, up to 3000 characters</span>
            <textarea name="abstract" rows={7} maxLength={3000} defaultValue={values.abstract} required /></label>
          <label>Audience level
            <select name="level" defaultValue={values.level}>
              <option value="">Not specified</option>
              {levels.map((l) => <option key={l}>{l}</option>)}
            </select></label>
          <label>Co-speakers <span className="opt">name and email, one per line</span>
            <textarea name="co_speakers" rows={2} defaultValue={values.co_speakers} /></label>
          <label>Notes for the organisers <span className="opt">availability, accessibility needs, anything else</span>
            <textarea name="notes" rows={3} defaultValue={values.notes} /></label>
          <div className="actions">
            <SubmitButton>{editing ? 'Save changes' : count > 1 ? `Submit to ${count} conferences` : 'Submit proposal'}</SubmitButton>
            <Link className="btn btn-ghost" href={cancelHref}>Cancel</Link>
          </div>
        </form>
      </section>
    </>
  );
}

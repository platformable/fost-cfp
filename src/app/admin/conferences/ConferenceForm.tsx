'use client';

import { useActionState } from 'react';
import type { ConferenceFormState } from '@/actions/admin';
import { SubmitButton } from '@/components/SubmitButton';
import { Errors } from '@/components/ui';
import { ConferenceDates } from './ConferenceDates';

type Values = Record<string, unknown>;

export function ConferenceForm({ action, initial, isNew }: {
  action: (s: ConferenceFormState, f: FormData) => Promise<ConferenceFormState>;
  initial: Values;
  isNew: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  const v = (state.values ?? initial) as Record<string, string | boolean | null>;
  const s = (k: string) => (v[k] == null ? '' : String(v[k]));
  return (
    <form action={formAction} className="form" key={JSON.stringify(state.errors ?? [])}>
      <Errors errors={state.errors} />
      <label>Name <input name="name" defaultValue={s('name')} required /></label>
      <label>URL slug <span className="opt">used in links, e.g. /cfp/my-conf-2027; generated from the name if blank</span><input name="slug" defaultValue={s('slug')} /></label>
      <label>Description <textarea name="description" rows={5} defaultValue={s('description')} /></label>
      <div className="field-row">
        <label>Location <input name="location" defaultValue={s('location')} /></label>
        <label>Website <input name="website" defaultValue={s('website')} placeholder="https://" /></label>
      </div>
      <ConferenceDates values={v} />
      <div className="field-row">
        <label>CFP opens <span className="opt">blank = now</span><input type="date" name="cfp_opens" defaultValue={s('cfp_opens')} /></label>
        <label>CFP closes <span className="opt">end of day; blank = never</span><input type="date" name="cfp_closes" defaultValue={s('cfp_closes')} /></label>
      </div>
      <div className="field-row">
        <label>Topics <span className="opt">one per line; speakers pick one. Leave blank for none</span><textarea name="topics" rows={5} defaultValue={s('topics')} /></label>
        <label>Session formats <span className="opt">one per line; blank = defaults</span>
          <textarea name="formats" rows={5} defaultValue={s('formats')} placeholder={'Talk (30 min)\nLightning talk (10 min)\nWorkshop (90 min)\nPanel (45 min)'} /></label>
      </div>
      <label className="check"><input type="checkbox" name="blind_review" value="1" defaultChecked={!!v.blind_review} /> Anonymous review (hide speaker identity from reviewers)</label>
      <SubmitButton>{isNew ? 'Create conference' : 'Save changes'}</SubmitButton>
    </form>
  );
}

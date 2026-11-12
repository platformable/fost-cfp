'use client';

import { useActionState } from 'react';
import { changePasswordAction, saveProfileAction, type ProfileState } from '@/actions/profile';
import { SubmitButton } from '@/components/SubmitButton';
import { Errors } from '@/components/ui';

type Profile = Record<string, string>;

export function ProfileForm({ profile, countries }: { profile: Profile; countries: { code: string; name: string }[] }) {
  const [state, action] = useActionState<ProfileState, FormData>(saveProfileAction, {});
  const v = { ...profile, ...(state.values ?? {}) };
  return (
    <form action={action} className="form" key={state.at ?? JSON.stringify(state.values ?? {})}>
      <Errors errors={state.error} />
      {state.ok && <div className="flash flash-success" role="status">{state.ok}</div>}
      <div className="field-row">
        <label>First name <input name="first_name" defaultValue={v.first_name} required autoComplete="given-name" /></label>
        <label>Last name <input name="last_name" defaultValue={v.last_name} autoComplete="family-name" /></label>
      </div>
      <div className="field-row">
        <label>Job title <input name="job_title" defaultValue={v.job_title} /></label>
        <label>Organisation <input name="organization" defaultValue={v.organization} /></label>
      </div>
      <label>Short bio <span className="opt">third person, ~100 words</span>
        <textarea name="bio" rows={6} defaultValue={v.bio} /></label>
      <label>LinkedIn profile URL
        <input name="linkedin_profile_url" inputMode="url" autoComplete="url" defaultValue={v.linkedin_profile_url} placeholder="https://www.linkedin.com/in/your-name" /></label>
      <label>Bluesky profile <span className="opt">optional</span>
        <input name="bluesky_profile_url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} defaultValue={v.bluesky_profile_url} placeholder="@name.bsky.social" /></label>
      <div className="field-row">
        <label>Phone <span className="opt">organisers only</span> <input name="phone" defaultValue={v.phone} autoComplete="tel" /></label>
        <label>Country
          <select name="country" defaultValue={v.country} autoComplete="country">
            <option value="">Not specified</option>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select></label>
      </div>
      <label>Headshot URL <span className="opt">Optional. If you leave this blank, we&apos;ll use the photo on your LinkedIn profile.</span>
        <input name="photo_url" defaultValue={v.photo_url} placeholder="https://…/photo.jpg" /></label>
      <fieldset className="conf-picks">
        <legend>More about you <span className="opt">(optional)</span></legend>
        <div className="field-row">
          <label>What is your gender? <span className="opt">Only you and the FOST organisers can see this.</span>
            <select name="gender" defaultValue={v.gender}>
              <option value="">Not answered</option>
              {['Female', 'Male', 'Prefer not to say', 'Other'].map((g) => <option key={g}>{g}</option>)}
            </select></label>
          <label>Would you be open to being an MC (Master of Ceremonies) at a FOST conference?
            <select name="mc_interest" defaultValue={v.mc_interest}>
              <option value="">Not answered</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select></label>
        </div>
      </fieldset>
      <SubmitButton>Save profile</SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState<ProfileState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="form" key={state.at}>
      <Errors errors={state.error} />
      {state.ok && <p className="form-ok" role="status">{state.ok}</p>}
      <label>Current password <input type="password" name="current_password" required autoComplete="current-password" /></label>
      <label>New password <input type="password" name="new_password" minLength={8} required autoComplete="new-password" /></label>
      <SubmitButton className="btn btn-ghost">Change password</SubmitButton>
    </form>
  );
}

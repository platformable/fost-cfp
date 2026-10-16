'use client';

import { useActionState } from 'react';
import { registerAction, type AuthState } from '@/actions/auth';
import { SubmitButton } from '@/components/SubmitButton';
import { Errors } from '@/components/ui';

export function RegisterForm({ next }: { next: string }) {
  const [state, action] = useActionState<AuthState, FormData>(registerAction, {});
  const v = state.values ?? {};
  return (
    <form action={action} className="form" key={JSON.stringify(v)}>
      <Errors errors={state.error} />
      <input type="hidden" name="next" value={next} />
      <div className="field-row">
        <label>First name <input name="first_name" defaultValue={v.first_name} required autoComplete="given-name" /></label>
        <label>Last name <input name="last_name" defaultValue={v.last_name} autoComplete="family-name" /></label>
      </div>
      <label>Email <input type="email" name="email" defaultValue={v.email} required autoComplete="email" /></label>
      <label>Organisation <span className="opt">optional</span> <input name="organization" defaultValue={v.organization} autoComplete="organization" /></label>
      <label>Password <span className="opt">at least 8 characters</span> <input type="password" name="password" minLength={8} required autoComplete="new-password" /></label>
      <SubmitButton>Create account</SubmitButton>
    </form>
  );
}

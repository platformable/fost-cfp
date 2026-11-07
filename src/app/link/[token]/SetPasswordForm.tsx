'use client';

import { useActionState } from 'react';
import { setPasswordAction, type AuthState } from '@/actions/auth';
import { SubmitButton } from '@/components/SubmitButton';
import { Errors } from '@/components/ui';

export function SetPasswordForm({ token, email, button }: { token: string; email: string; button: string }) {
  const [state, action] = useActionState<AuthState, FormData>(setPasswordAction.bind(null, token), {});
  return (
    <form action={action} className="form">
      <Errors errors={state.error} />
      <input type="email" name="username" value={email} readOnly hidden autoComplete="username" />
      <label>New password <span className="opt">at least 8 characters</span>
        <input type="password" name="password" minLength={8} required autoFocus autoComplete="new-password" /></label>
      <label>New password again
        <input type="password" name="password_again" minLength={8} required autoComplete="new-password" /></label>
      <SubmitButton>{button}</SubmitButton>
    </form>
  );
}

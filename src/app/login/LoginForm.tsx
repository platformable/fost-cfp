'use client';

import { useActionState } from 'react';
import { loginAction, type AuthState } from '@/actions/auth';
import { SubmitButton } from '@/components/SubmitButton';
import { Errors } from '@/components/ui';

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState<AuthState, FormData>(loginAction, {});
  return (
    <form action={action} className="form">
      <Errors errors={state.error} />
      <input type="hidden" name="next" value={next} />
      <label>Email <input type="email" name="email" defaultValue={state.values?.email} key={state.values?.email} required autoFocus autoComplete="email" /></label>
      <label>Password <input type="password" name="password" required autoComplete="current-password" /></label>
      <SubmitButton>Sign in</SubmitButton>
    </form>
  );
}

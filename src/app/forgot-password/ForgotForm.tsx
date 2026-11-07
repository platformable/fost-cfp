'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { forgotPasswordAction, type AuthState } from '@/actions/auth';
import { SubmitButton } from '@/components/SubmitButton';
import { Errors } from '@/components/ui';

export function ForgotForm() {
  const [state, action] = useActionState<AuthState, FormData>(forgotPasswordAction, {});
  if (state.sent) {
    return (
      <div className="flash flash-success" role="status">
        <p style={{ marginTop: 0 }}>If an account exists for {state.sent}, we have sent a link to reset your password. It works once and lasts 24 hours.</p>
        <p style={{ marginBottom: 0, fontWeight: 400 }}>Nothing arrived after a few minutes? Check your spam folder, or ask the FOST organisers for a link. <Link href="/login">Back to sign in</Link></p>
      </div>
    );
  }
  return (
    <form action={action} className="form">
      <Errors errors={state.error} />
      <label>Email <input type="email" name="email" defaultValue={state.values?.email} required autoFocus autoComplete="email" /></label>
      <SubmitButton>Email me a link</SubmitButton>
    </form>
  );
}

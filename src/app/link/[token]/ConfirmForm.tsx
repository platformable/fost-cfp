'use client';

import { useActionState, useState } from 'react';
import { confirmProposalAction, type ConfirmState } from '@/actions/guests';
import { SubmitButton } from '@/components/SubmitButton';
import { Errors } from '@/components/ui';

// Confirms a guest's proposals, optionally setting a password at the same time (claiming the account).
export function ConfirmForm({ token, email, hasPassword }: { token: string; email: string; hasPassword: boolean }) {
  const [state, action] = useActionState<ConfirmState, FormData>(confirmProposalAction.bind(null, token), {});
  const [setPw, setSetPw] = useState(false);
  if (state.confirmed) {
    return (
      <div className="flash flash-success" role="status">
        <p style={{ marginTop: 0 }}>Thank you: {state.confirmed === 1 ? 'your proposal is' : `your ${state.confirmed} proposals are`} confirmed and with the program committee.</p>
        <p style={{ marginBottom: 0, fontWeight: 400 }}>{hasPassword
          ? <>Sign in to see or edit {state.confirmed === 1 ? 'it' : 'them'}.</>
          : <>To edit later, set a password at any time with <a href="/forgot-password">Forgot your password?</a> using {email}.</>}</p>
      </div>
    );
  }
  return (
    <form action={action} className="form">
      <Errors errors={state.error} />
      {!hasPassword && (
        <label className="check"><input type="checkbox" name="set_password" value="1" checked={setPw} onChange={(e) => setSetPw(e.target.checked)} />
          {' '}Also set a password now, so I can sign in and edit my proposals</label>
      )}
      {setPw && <>
        <input type="email" name="username" value={email} readOnly hidden autoComplete="username" />
        <label>Password <span className="opt">at least 8 characters</span>
          <input type="password" name="password" minLength={8} required autoComplete="new-password" /></label>
        <label>Password again
          <input type="password" name="password_again" minLength={8} required autoComplete="new-password" /></label>
      </>}
      <SubmitButton>{setPw ? 'Confirm and set password' : 'Confirm'}</SubmitButton>
    </form>
  );
}

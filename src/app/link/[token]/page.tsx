import Link from 'next/link';
import { lookupLink } from '@/lib/email-links';
import { AuthLogo } from '../../register/AuthLogo';
import { SetPasswordForm } from './SetPasswordForm';
import { ConfirmForm } from './ConfirmForm';
import { awaitingFor } from '@/lib/guests';

export const metadata = { title: 'Set your password', robots: { index: false } };
export const dynamic = 'force-dynamic';

// Opening the page never uses the link up; only submitting the form does.
export default async function LinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { state, link, user } = await lookupLink(token);
  if (state !== 'valid' || !link || !user) {
    const why = {
      used: 'This link has already been used, or a newer link has been sent since.',
      expired: 'This link has expired.',
      invalid: 'This link is not valid. Check you copied all of it.',
      valid: '',
    }[state];
    return (
      <section className="card narrow">
        <AuthLogo />
        <h1>This link no longer works</h1>
        <p>{why}</p>
        <p><Link className="btn" href="/forgot-password">Email me a new link</Link></p>
        <p className="muted"><Link href="/login">Back to sign in</Link></p>
      </section>
    );
  }
  if (link.purpose === 'confirm_proposal') {
    const awaiting = await awaitingFor(user.id);
    return (
      <section className="card narrow">
        <AuthLogo />
        <h1>Confirm your proposal{awaiting.length === 1 ? '' : 's'}</h1>
        {awaiting.length ? (
          <>
            <p>Hello {user.first_name}. Confirm that you sent {awaiting.length === 1 ? 'this proposal' : 'these proposals'} from <strong>{user.email}</strong>:</p>
            <ul>{awaiting.map((a) => <li key={a.id}><strong>{a.title}</strong> <span className="muted">for {a.conference}</span></li>)}</ul>
            <ConfirmForm token={token} email={user.email} hasPassword={user.password_hash !== ''} />
          </>
        ) : <p>There is nothing left to confirm: your proposals have already been confirmed. <Link href="/login">Sign in</Link> to see them.</p>}
      </section>
    );
  }
  const invite = link.purpose === 'committee_invite';
  const claim = link.purpose === 'claim_account';
  return (
    <section className="card narrow">
      <AuthLogo />
      <h1>{invite ? 'Welcome to the program committee' : claim ? 'Set a password for your account' : 'Choose a new password'}</h1>
      <p>{invite
        ? <>Hello {user.first_name}. Choose a password for <strong>{user.email}</strong> to start reviewing proposals.</>
        : claim
          ? <>Hello {user.first_name}. Choose a password for <strong>{user.email}</strong> to sign in, see your proposals and edit them.</>
          : <>Choose a new password for <strong>{user.email}</strong>. You will be signed in, and signed out everywhere else.</>}</p>
      <SetPasswordForm token={token} email={user.email} button={invite ? 'Set password and start reviewing' : claim ? 'Set password and sign in' : 'Save new password'} />
    </section>
  );
}

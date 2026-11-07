import Link from 'next/link';
import { AuthLogo } from '../register/AuthLogo';
import { ForgotForm } from './ForgotForm';

export const metadata = { title: 'Forgot your password?' };

export default function ForgotPassword() {
  return (
    <section className="card narrow">
      <AuthLogo />
      <h1>Forgot your password?</h1>
      <p>Enter the email you use for FOST Call for Speakers and we will email you a link to choose a new password.</p>
      <ForgotForm />
      <p className="muted"><Link href="/login">Back to sign in</Link></p>
    </section>
  );
}

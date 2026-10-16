import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { AuthLogo } from './AuthLogo';
import { RegisterForm } from './RegisterForm';

export const metadata = { title: 'Create an account' };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await currentUser()) redirect('/proposals');
  const next = (await searchParams).next ?? '';
  return (
    <section className="card narrow">
      <AuthLogo />
      <h1>Create your speaker account</h1>
      <p className="muted">One account lets you submit to any of our conferences and track every proposal in one place.</p>
      <RegisterForm next={next} />
      <p className="muted">Already registered? <Link href="/login">Sign in</Link>.</p>
    </section>
  );
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { AuthLogo } from '../register/AuthLogo';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await currentUser()) redirect('/proposals');
  const next = (await searchParams).next ?? '';
  return (
    <section className="card narrow">
      <AuthLogo />
      <h1>Sign in</h1>
      <LoginForm next={next} />
      <p className="muted">New here? <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link> to submit a proposal.</p>
    </section>
  );
}

import Link from 'next/link';

export const metadata = { title: 'Check your email', robots: { index: false } };

// Shown after every guest submission, whether or not an account exists for the email.
export default async function CheckEmail({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const email = String((await searchParams).email ?? '').slice(0, 200);
  return (
    <section className="card narrow">
      <h1>Check your email to confirm your proposal</h1>
      <p>We have sent a confirmation link to <strong>{email || 'the address you gave'}</strong>. Your proposal only counts once you open the link and confirm. The link works for 6 months.</p>
      <p className="small muted">Is that address wrong? Nothing has been sent to the committee, so just <Link href="/proposals/new">submit again</Link> with the right one.
        Nothing arrived after a few minutes? Check your spam folder, or ask the FOST organisers.</p>
    </section>
  );
}

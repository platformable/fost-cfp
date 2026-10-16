import Link from 'next/link';

export const metadata = { title: 'Not allowed' };

export default function Forbidden() {
  return (
    <section className="card narrow">
      <h1>Not allowed</h1>
      <p>You do not have access to this page.</p>
      <p><Link href="/">Back to the start</Link></p>
    </section>
  );
}

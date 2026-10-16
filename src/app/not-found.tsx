import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="card narrow">
      <h1>Not found</h1>
      <p>That page does not exist, or you do not have access to it.</p>
      <p><Link href="/">Back to the start</Link></p>
    </section>
  );
}

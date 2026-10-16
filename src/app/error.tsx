'use client';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="card narrow">
      <h1>Something went wrong</h1>
      <p>An unexpected error occurred. Try again, and if it keeps happening, let the organisers know.</p>
      <button className="btn" onClick={() => reset()}>Try again</button>
    </section>
  );
}

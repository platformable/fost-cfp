import Link from 'next/link';
import { notFound } from 'next/navigation';
import { addReviewerAction, conferenceFlagAction, removeReviewerAction, saveConferenceAction } from '@/actions/admin';
import { committee, getConference } from '@/lib/conferences';
import { requireRole } from '@/lib/session';
import { SubmitButton } from '@/components/SubmitButton';
import { ConferenceForm } from '../ConferenceForm';

export default async function EditConference({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  await requireRole(['admin'], `/admin/conferences/${id}`);
  const conf = Number.isInteger(id) ? await getConference(id) : null;
  if (!conf) notFound();
  const reviewers = await committee(conf.id);
  const flag = conferenceFlagAction.bind(null, conf.id);
  return (
    <>
      <p><Link href="/admin">← Organiser dashboard</Link></p>
      <h1>{conf.name}</h1>
      <div className="two-col wide-left">
        <section className="card">
          <h2>Details</h2>
          <ConferenceForm action={saveConferenceAction.bind(null, conf.id)} initial={{ ...conf }} isNew={false} />
        </section>
        <div>
          <section className="card" id="publish">
            <h2>Decisions</h2>
            <p>Decisions are currently <strong>{conf.decisions_published ? 'visible to speakers' : 'hidden from speakers'}</strong>.{' '}
              {conf.decisions_published ? 'Accepted speakers can confirm or decline their slot.' : 'Speakers see "Under review" until you publish.'}</p>
            <form action={flag}>
              <input type="hidden" name="flag" value="decisions_published" />
              <input type="hidden" name="value" value={conf.decisions_published ? '0' : '1'} />
              <SubmitButton className={conf.decisions_published ? 'btn btn-ghost' : 'btn'}
                confirmText={conf.decisions_published ? undefined : 'Show all current decisions to speakers?'}>
                {conf.decisions_published ? 'Hide decisions' : 'Publish decisions to speakers'}
              </SubmitButton>
            </form>
          </section>

          <section className="card" id="committee">
            <h2>Program committee</h2>
            {!reviewers.length && <p className="muted">No reviewers yet. Admins can always review.</p>}
            <ul className="plain">
              {reviewers.map((r) => (
                <li className="row-between" key={r.id}>
                  <span><strong>{r.name}</strong> <span className="small muted">{r.email} · {r.reviews_done} reviews</span></span>
                  <form action={removeReviewerAction.bind(null, conf.id, r.id)} className="inline"><SubmitButton className="linklike danger">Remove</SubmitButton></form>
                </li>
              ))}
            </ul>
            <form action={addReviewerAction.bind(null, conf.id)} className="form inline-form">
              <input type="email" name="email" placeholder="reviewer@example.com" required aria-label="Reviewer email" />
              <SubmitButton className="btn btn-small">Add reviewer</SubmitButton>
            </form>
            <p className="small muted">The person needs an account first. Adding them gives them the reviewer role.</p>
          </section>

          <section className="card">
            <h2>Share</h2>
            <p className="small">Public CFP page: <Link href={`/cfp/${conf.slug}`}>/cfp/{conf.slug}</Link></p>
            <form action={flag}>
              <input type="hidden" name="flag" value="archived" />
              <input type="hidden" name="value" value={conf.archived ? '0' : '1'} />
              <SubmitButton className="linklike">{conf.archived ? 'Restore conference' : 'Archive conference (hide from public list)'}</SubmitButton>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { confirmAction, withdrawAction } from '@/actions/proposals';
import { getConference } from '@/lib/conferences';
import { editWindow, getProposal, history, publicStatus } from '@/lib/proposals';
import { formatDate } from '@/lib/format';
import { requireUser } from '@/lib/session';
import { SubmitButton } from '@/components/SubmitButton';
import { Badge, EditWindowLabel, Prose } from '@/components/ui';

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const user = await requireUser(`/proposals/${id}`);
  const p = await getProposal(id);
  if (p && p.speaker_id !== user.id && (user.role === 'admin' || user.role === 'reviewer')) redirect(`/review/proposals/${id}`);
  if (!p || p.speaker_id !== user.id) notFound();
  const conf = (await getConference(p.conference_id))!;
  const shown = publicStatus(p, conf);
  const edit = editWindow(p, conf);
  const activity = await history(p.id, ['submitted', 'edited', 'withdrawn', 'confirmed', 'declined']);
  const confirm = confirmAction.bind(null, p.id);
  const canWithdraw = shown !== 'withdrawn' && shown !== 'rejected' && p.speaker_confirmation !== 'declined';

  return (
    <>
      <p><Link href="/proposals">← My proposals</Link></p>
      <div className="row-between">
        <div>
          <Badge status={shown} />
          <h1>{p.title}</h1>
          <p className="muted">{p.conference_name} · {[p.format, p.topic, p.level].filter(Boolean).join(' · ')} · version {p.version}</p>
        </div>
        <div className="actions">{edit.editable && <Link className="btn" href={`/proposals/${p.id}/edit`}>Edit proposal</Link>}</div>
      </div>

      {shown === 'accepted' ? (
        <section className="card callout callout-success">
          <h2>Your proposal was accepted</h2>
          {p.feedback_to_speaker && <Prose>{p.feedback_to_speaker}</Prose>}
          {!p.speaker_confirmation ? (
            <>
              <p>Please confirm that you will present this session.</p>
              <div className="actions">
                <form action={confirm} className="inline"><input type="hidden" name="answer" value="confirm" /><SubmitButton>Confirm I&apos;ll speak</SubmitButton></form>
                <form action={confirm} className="inline"><input type="hidden" name="answer" value="decline" />
                  <SubmitButton className="btn btn-danger" confirmText="Decline this speaking slot? This cannot be undone from here.">I can no longer speak</SubmitButton></form>
              </div>
            </>
          ) : p.speaker_confirmation === 'confirmed' ? (
            <>
              <p><strong>You confirmed on {formatDate(p.confirmed_at)}.</strong> You can still update your title and abstract for the program.</p>
              <form action={confirm} className="inline"><input type="hidden" name="answer" value="decline" />
                <SubmitButton className="linklike danger" confirmText="Withdraw from speaking?">I can no longer speak</SubmitButton></form>
            </>
          ) : <p>You declined this slot on {formatDate(p.confirmed_at)}.</p>}
        </section>
      ) : (shown === 'waitlisted' || shown === 'rejected') && p.feedback_to_speaker ? (
        <section className="card callout"><h2>Feedback from the committee</h2><Prose>{p.feedback_to_speaker}</Prose></section>
      ) : null}

      <div className="two-col wide-left">
        <section className="card">
          <h2>Abstract</h2>
          <Prose>{p.abstract}</Prose>
          {p.co_speakers && <><h2>Co-speakers</h2><Prose>{p.co_speakers}</Prose></>}
          {p.notes && <><h2>Notes for the organisers</h2><Prose>{p.notes}</Prose></>}
        </section>
        <aside className="card">
          <dl className="facts">
            <dt>Submitted</dt><dd>{formatDate(p.submitted_at)}</dd>
            <dt>Last updated</dt><dd>{formatDate(p.updated_at)}</dd>
            <dt>Editing</dt><dd><EditWindowLabel edit={edit} /></dd>
          </dl>
          {activity.length > 0 && (
            <>
              <h3>Activity</h3>
              <ul className="timeline">
                {activity.map((h) => (
                  <li key={h.id}><span className="small muted">{formatDate(h.created_at)}</span> {h.action}
                    {h.action === 'edited' && h.detail && <span className="small muted"> ({h.detail.replace('Changed: ', '')})</span>}</li>
                ))}
              </ul>
            </>
          )}
          {canWithdraw && (
            <form action={withdrawAction.bind(null, p.id)}>
              <SubmitButton className="linklike danger" confirmText="Withdraw this proposal? You will not be able to undo this.">Withdraw proposal</SubmitButton>
            </form>
          )}
        </aside>
      </div>
    </>
  );
}

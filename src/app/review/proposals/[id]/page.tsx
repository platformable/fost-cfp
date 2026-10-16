import Link from 'next/link';
import { notFound } from 'next/navigation';
import { decisionAction, saveReviewAction } from '@/actions/review';
import { getConference, isReviewerFor } from '@/lib/conferences';
import { countryName } from '@/lib/countries';
import { DECISIONS, RECOMMENDATIONS, getProposal, history, neighbours, reviewsFor } from '@/lib/proposals';
import { formatDate, safeUrl, statusLabel } from '@/lib/format';
import { requireRole } from '@/lib/session';
import { SubmitButton } from '@/components/SubmitButton';
import { Badge, Prose } from '@/components/ui';

export default async function ReviewProposal({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const user = await requireRole(['reviewer', 'admin'], `/review/proposals/${id}`);
  const p = await getProposal(id);
  if (!p || !(await isReviewerFor(user, p.conference_id))) notFound();
  const conf = (await getConference(p.conference_id))!;
  const admin = user.role === 'admin';
  const blind = conf.blind_review && !admin;
  const isOwn = p.speaker_id === user.id;

  const [all, nav, log] = await Promise.all([reviewsFor(p.id), neighbours(conf.id, p.id), admin ? history(p.id) : Promise.resolve([])]);
  const mine = all.find((r) => r.reviewer_id === user.id);
  // Reviewers see colleagues' reviews only after submitting their own, to avoid anchoring.
  const showOthers = admin || !!mine;
  const avg = all.length ? Math.round((all.reduce((n, r) => n + r.score, 0) / all.length) * 100) / 100 : null;
  const linkedin = safeUrl(p.speaker_linkedin_profile_url);
  const topics = p.topic && !conf.topicList.includes(p.topic) ? [...conf.topicList, p.topic] : conf.topicList;

  return (
    <>
      <div className="row-between">
        <p><Link href={`/review/conferences/${conf.id}`}>← {conf.name}</Link></p>
        <p className="pager">
          {nav.prevId && <Link href={`/review/proposals/${nav.prevId}`}>← Previous</Link>}{' '}
          {nav.nextId && <Link href={`/review/proposals/${nav.nextId}`}>Next →</Link>}
        </p>
      </div>
      <Badge status={p.status} />
      {p.status === 'accepted' && <span className="badge">{p.speaker_confirmation ? `Speaker ${p.speaker_confirmation}` : 'Awaiting speaker confirmation'}</span>}
      <h1>{p.title}</h1>
      <p className="muted">{[p.format, p.topic, p.level].filter(Boolean).join(' · ')} · #{p.id} · v{p.version} · submitted {formatDate(p.submitted_at)}</p>

      <div className="two-col wide-left">
        <div>
          <section className="card">
            <h2>Abstract</h2>
            <Prose>{p.abstract}</Prose>
            {p.notes && <><h2>Notes for the organisers</h2><Prose>{p.notes}</Prose></>}
          </section>
          {!blind ? (
            <section className="card">
              <h2>Speaker</h2>
              <p>
                <strong>{p.speaker_name}</strong>{p.speaker_job_title && `, ${p.speaker_job_title}`}{p.speaker_organization && ` · ${p.speaker_organization}`}
                {p.speaker_country && ` · ${countryName(p.speaker_country)}`}
                {admin && <><br /><a href={`mailto:${p.speaker_email}`}>{p.speaker_email}</a></>}
                {linkedin && <><br /><a href={linkedin} target="_blank" rel="noopener">LinkedIn profile</a></>}
              </p>
              {p.speaker_bio && <Prose>{p.speaker_bio}</Prose>}
              {p.co_speakers && <><h3>Co-speakers</h3><Prose>{p.co_speakers}</Prose></>}
            </section>
          ) : (
            <section className="card muted">Speaker details are hidden: this conference uses anonymous review.</section>
          )}
          <section className="card">
            <h2>Committee reviews <span className="muted small">{all.length} review{all.length === 1 ? '' : 's'}{avg !== null && ` · average ${avg}`}</span></h2>
            {!showOthers ? <p className="muted">Submit your own review to see what other committee members said.</p>
              : !all.length ? <p className="muted">No reviews yet.</p>
                : all.map((r) => (
                  <div className="review" key={r.id}>
                    <div className="row-between"><strong>{r.reviewer_name}</strong>
                      <span><span className="score">Score {r.score}/5</span> <Badge status={`rec-${r.recommendation}`} label={r.recommendation} /></span></div>
                    {r.comments && <Prose>{r.comments}</Prose>}
                    <span className="small muted">{formatDate(r.updated_at)}</span>
                  </div>
                ))}
          </section>
        </div>

        <div>
          <section className="card sticky">
            <h2>Your review</h2>
            {isOwn ? <p className="muted">This is your own proposal, so you can&apos;t review it.</p>
              : p.status === 'withdrawn' ? <p className="muted">The speaker withdrew this proposal.</p>
                : (
                  <form action={saveReviewAction.bind(null, p.id)} className="form">
                    <fieldset className="scores">
                      <legend>Score</legend>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <label key={n}><input type="radio" name="score" value={n} defaultChecked={mine?.score === n} required /> {n}</label>
                      ))}
                      <p className="small muted">1 = poor fit · 3 = solid · 5 = must have</p>
                    </fieldset>
                    <label>Recommendation
                      <select name="recommendation" defaultValue={mine?.recommendation ?? ''} required>
                        <option value="">Choose…</option>
                        {RECOMMENDATIONS.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
                      </select></label>
                    <label>Comments <span className="opt">visible to the committee only</span>
                      <textarea name="comments" rows={5} defaultValue={mine?.comments ?? ''} /></label>
                    <div className="actions">
                      <SubmitButton>{mine ? 'Update review' : 'Save review'}</SubmitButton>
                      {nav.nextId && <SubmitButton className="btn btn-ghost" name="next" value={String(nav.nextId)}>Save &amp; next →</SubmitButton>}
                    </div>
                  </form>
                )}
          </section>

          {admin && (
            <section className="card" id="decision">
              <h2>Decision</h2>
              {p.status === 'withdrawn' ? <p className="muted">Withdrawn by the speaker.</p> : (
                <form action={decisionAction.bind(null, p.id)} className="form">
                  <label>Status
                    <select name="status" defaultValue={p.status}>{DECISIONS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label>
                  {topics.length > 0 && (
                    <label>Topic <span className="opt">chosen by the speaker; you can change it</span>
                      <select name="topic" defaultValue={p.topic}>
                        <option value="">Not assigned</option>
                        {topics.map((t) => <option key={t}>{t}</option>)}
                      </select></label>
                  )}
                  <label>Message to speaker <span className="opt">shown once decisions are published; also in exports</span>
                    <textarea name="feedback_to_speaker" rows={4} defaultValue={p.feedback_to_speaker} /></label>
                  <label>Internal notes <span className="opt">organisers only</span>
                    <textarea name="internal_notes" rows={3} defaultValue={p.internal_notes} /></label>
                  <SubmitButton>Save decision</SubmitButton>
                </form>
              )}
              <p className="small muted">Speakers {conf.decisions_published ? 'can' : 'cannot yet'} see decisions for this conference.</p>
            </section>
          )}
          {log.length > 0 && (
            <section className="card">
              <h3>History</h3>
              <ul className="timeline">
                {log.map((h) => (
                  <li key={h.id}><span className="small muted">{formatDate(h.created_at)}</span> {h.action}{!blind && <> by {h.user_name ?? 'unknown'}</>}
                    {h.detail && <span className="small muted"> ({h.detail})</span>}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

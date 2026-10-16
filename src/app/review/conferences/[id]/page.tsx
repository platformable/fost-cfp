import Link from 'next/link';
import { notFound } from 'next/navigation';
import { bulkDecisionAction } from '@/actions/review';
import { getConference, isReviewerFor } from '@/lib/conferences';
import { DECISIONS, STATUSES, reviewList, statusCounts, type ReviewFilter } from '@/lib/proposals';
import { statusLabel } from '@/lib/format';
import { requireRole } from '@/lib/session';
import { SubmitButton } from '@/components/SubmitButton';
import { Badge } from '@/components/ui';
import { SelectAll } from './SelectAll';

type Search = Record<string, string | undefined>;
const SORTS = [['newest', 'Newest'], ['score', 'Average score'], ['reviews', 'Fewest reviews'], ['title', 'Title']] as const;

export default async function ReviewList({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const id = Number((await params).id);
  const q = await searchParams;
  const user = await requireRole(['reviewer', 'admin'], `/review/conferences/${id}`);
  const conf = Number.isInteger(id) ? await getConference(id) : null;
  if (!conf || !(await isReviewerFor(user, conf.id))) notFound();

  const filter: ReviewFilter = {
    status: (STATUSES as readonly string[]).includes(q.status ?? '') ? q.status! : '',
    topic: conf.topicList.includes(q.topic ?? '') ? q.topic! : '',
    todo: q.todo === '1',
    sort: (SORTS.map((s) => s[0]) as string[]).includes(q.sort ?? '') ? (q.sort as ReviewFilter['sort']) : 'newest',
  };
  const [proposals, counts] = await Promise.all([reviewList(conf, user, filter), statusCounts(conf.id)]);
  const blind = conf.blind_review && user.role !== 'admin';
  const admin = user.role === 'admin';
  const qs = new URLSearchParams(Object.entries({ ...filter, todo: filter.todo ? '1' : '' }).filter(([, v]) => v) as [string, string][]).toString();
  const returnTo = `/review/conferences/${conf.id}${qs ? `?${qs}` : ''}`;

  return (
    <>
      <p><Link href="/review">← Program committee</Link></p>
      <div className="row-between">
        <h1>{conf.name}</h1>
        {admin && (
          <div className="actions">
            <a className="btn btn-ghost" href={`/admin/export/submissions.xlsx?conference=${conf.slug}`}>⬇ Submissions (.xlsx)</a>
            <a className="btn btn-ghost" href={`/admin/export/workbook.xlsx?conference=${conf.slug}`}>⬇ Full workbook</a>
          </div>
        )}
      </div>
      <p className="muted">
        {STATUSES.map((s) => <Badge key={s} status={s} label={`${statusLabel(s)}: ${counts[s] ?? 0}`} />)}
        {blind && <> · <strong>Anonymous review</strong></>}
        {admin && <> · Decisions <strong>{conf.decisions_published ? 'published to speakers' : 'not yet visible to speakers'}</strong> (<Link href={`/admin/conferences/${conf.id}#publish`}>change</Link>)</>}
      </p>

      <form method="get" className="filters card">
        <label>Status <select name="status" defaultValue={filter.status}><option value="">All active</option>
          {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label>
        {conf.topicList.length > 0 && (
          <label>Topic <select name="topic" defaultValue={filter.topic}><option value="">All</option>
            {conf.topicList.map((t) => <option key={t}>{t}</option>)}</select></label>
        )}
        <label>Sort <select name="sort" defaultValue={filter.sort}>
          {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="check"><input type="checkbox" name="todo" value="1" defaultChecked={filter.todo} /> Only ones I haven&apos;t reviewed</label>
        <button className="btn btn-small">Apply</button>
      </form>

      {!proposals.length ? (
        <div className="card empty">{filter.todo ? "You've reviewed everything here." : 'No proposals match.'}</div>
      ) : (
        <form action={bulkDecisionAction.bind(null, conf.id)}>
          <input type="hidden" name="return_to" value={returnTo} />
          <div className="table-wrap card flush">
            <table>
              <thead><tr>
                {admin && <th><SelectAll /></th>}
                <th>Title</th>{!blind && <th>Speaker</th>}<th>Format / topic</th><th className="num">Reviews</th><th className="num">Avg</th><th className="num">Mine</th><th>Status</th>
              </tr></thead>
              <tbody>
                {proposals.map((p) => (
                  <tr key={p.id}>
                    {admin && <td><input type="checkbox" name="ids" value={p.id} aria-label="Select" /></td>}
                    <td><Link href={`/review/proposals/${p.id}`}><strong>{p.title}</strong></Link></td>
                    {!blind && <td>{p.speaker_name}{p.speaker_organization && <><br /><span className="small muted">{p.speaker_organization}</span></>}</td>}
                    <td>{p.format}{p.topic && <><br /><span className="small muted">{p.topic}</span></>}</td>
                    <td className="num">{p.review_count}</td>
                    <td className="num"><strong>{p.avg_score ?? '–'}</strong></td>
                    <td className="num">{p.speaker_id === user.id ? 'own' : p.my_score ? `${p.my_score} · ${p.my_recommendation}` : '–'}</td>
                    <td><Badge status={p.status} />
                      {p.status === 'accepted' && p.speaker_confirmation && <><br /><span className="small muted">{p.speaker_confirmation}</span></>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {admin && (
            <div className="bulk card">
              <label>Set selected to{' '}
                <select name="status" required defaultValue=""><option value="">Choose…</option>
                  {DECISIONS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label>
              <SubmitButton className="btn btn-small">Apply decision</SubmitButton>
            </div>
          )}
        </form>
      )}
    </>
  );
}

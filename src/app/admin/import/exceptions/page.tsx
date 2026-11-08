import Link from 'next/link';
import { resolveExceptionAction } from '@/actions/imports';
import { listConferences } from '@/lib/conferences';
import { topicExceptions } from '@/lib/imports';
import { requireRole } from '@/lib/session';
import { SubmitButton } from '@/components/SubmitButton';

export const metadata = { title: 'Topic exceptions' };
export const dynamic = 'force-dynamic';

export default async function TopicExceptions() {
  await requireRole(['admin'], '/admin/import/exceptions');
  const [items, conferences] = await Promise.all([topicExceptions(), listConferences({ includeArchived: true })]);
  const topicsOf = new Map(conferences.map((c) => [c.id, c.topicList]));
  const byConference = new Map<string, typeof items>();
  for (const it of items) byConference.set(it.conference, [...(byConference.get(it.conference) ?? []), it]);
  return (
    <>
      <p><Link href="/admin/import">← Import from Typeform</Link></p>
      <h1>Topic exceptions</h1>
      <p>These imported proposals have no topic: none of the topics the speaker ticked in Typeform is on the conference&apos;s topic list. Choose one of the conference&apos;s topics, add the speaker&apos;s topic to the conference, or leave it without a topic. They are already visible to the committee meanwhile.</p>
      {!items.length && <div className="card empty">Nothing to resolve.</div>}
      {[...byConference].map(([conference, list]) => (
        <section className="card" key={conference}>
          <h2>{conference} <span className="small muted">({list.length})</span></h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Proposal</th><th>Ticked in Typeform</th><th>Topic</th></tr></thead>
              <tbody>
                {list.map((it) => {
                  const topics = topicsOf.get(it.conference_id) ?? [];
                  return (
                    <tr key={it.id}>
                      <td><Link href={`/review/proposals/${it.id}`}>{it.title}</Link><br /><span className="small muted">{it.speaker}</span></td>
                      <td className="small">{it.topics_ticked.join(', ') || 'None'}</td>
                      <td>
                        <form action={resolveExceptionAction.bind(null, it.id)} className="inline-form">
                          <select name="choice" required defaultValue="" aria-label={`Topic for ${it.title}`}>
                            <option value="" disabled>Choose…</option>
                            <optgroup label="Use one of this conference's topics">
                              {topics.map((t) => <option key={`u${t}`} value={`use:${t}`}>{t}</option>)}
                            </optgroup>
                            {it.topics_ticked.length > 0 && (
                              <optgroup label="Add the speaker's topic to this conference">
                                {it.topics_ticked.map((t) => <option key={`a${t}`} value={`add:${t}`}>Add &quot;{t}&quot;</option>)}
                              </optgroup>
                            )}
                            <option value="none">No topic</option>
                          </select>
                          <SubmitButton className="btn btn-small">Save</SubmitButton>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}

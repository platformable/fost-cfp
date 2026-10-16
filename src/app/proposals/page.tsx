import Link from 'next/link';
import { getConference, openConferences } from '@/lib/conferences';
import { editWindow, publicStatus, speakerProposals } from '@/lib/proposals';
import { formatDate } from '@/lib/format';
import { requireUser } from '@/lib/session';
import { Badge, EditWindowLabel } from '@/components/ui';

export const metadata = { title: 'My proposals' };

export default async function MyProposals() {
  const user = await requireUser('/proposals');
  const [rows, open] = await Promise.all([speakerProposals(user.id), openConferences()]);
  const confs = new Map();
  for (const p of rows) if (!confs.has(p.conference_id)) confs.set(p.conference_id, await getConference(p.conference_id));
  const proposals = rows.map((p) => {
    const conf = confs.get(p.conference_id);
    return { ...p, shown: publicStatus(p, conf), edit: editWindow(p, conf) };
  });
  return (
    <>
      <div className="row-between">
        <h1>My proposals</h1>
        {open.length > 0 && <Link className="btn" href="/proposals/new">New proposal</Link>}
      </div>
      {!proposals.length ? (
        <div className="card empty">
          <p>You haven&apos;t submitted any proposals yet.</p>
          {open.length ? <Link className="btn" href="/proposals/new">Submit your first proposal</Link> : <p className="muted">No calls for proposals are open right now.</p>}
        </div>
      ) : (
        <div className="table-wrap card flush">
          <table>
            <thead><tr><th>Title</th><th>Conference</th><th>Format / topic</th><th>Status</th><th>Time left to edit</th><th>Last updated</th><th></th></tr></thead>
            <tbody>
              {proposals.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/proposals/${p.id}`}><strong>{p.title}</strong></Link></td>
                  <td>{p.conference_name}</td>
                  <td>{p.format}{p.topic && <><br /><span className="small muted">{p.topic}</span></>}</td>
                  <td>
                    <Badge status={p.shown} />
                    {p.shown === 'accepted' && <><br /><span className="small muted">{p.speaker_confirmation ? `You ${p.speaker_confirmation}` : 'Please confirm'}</span></>}
                  </td>
                  <td><EditWindowLabel edit={p.edit} /></td>
                  <td className="nowrap">{formatDate(p.updated_at)}</td>
                  <td className="nowrap">{p.edit.editable && <Link href={`/proposals/${p.id}/edit`}>Edit</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

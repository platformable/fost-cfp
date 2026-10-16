import Link from 'next/link';
import { getConference, listConferences, type Conference } from '@/lib/conferences';
import { one, query } from '@/lib/db';
import { CFP_LABELS } from '@/lib/format';
import { requireRole } from '@/lib/session';
import { Badge } from '@/components/ui';

export const metadata = { title: 'Program committee' };

export default async function ReviewHome() {
  const user = await requireRole(['reviewer', 'admin'], '/review');
  let confs: Conference[];
  if (user.role === 'admin') confs = await listConferences({ includeArchived: true });
  else {
    const ids = await query<{ id: number }>(`SELECT c.id FROM conferences c JOIN conference_reviewers cr ON cr.conference_id = c.id
                                            WHERE cr.user_id = $1 ORDER BY c.start_date DESC NULLS LAST`, [user.id]);
    confs = (await Promise.all(ids.map((r) => getConference(r.id)))).filter((c): c is Conference => !!c);
  }
  const rows = await Promise.all(confs.map(async (c) => ({
    ...c,
    stats: (await one<{ total: number; mine: number; accepted: number }>(`
      SELECT COUNT(*) AS total,
             COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM reviews r WHERE r.proposal_id = p.id AND r.reviewer_id = $1)) AS mine,
             COUNT(*) FILTER (WHERE p.status = 'accepted') AS accepted
      FROM proposals p WHERE p.conference_id = $2 AND p.status <> 'withdrawn' AND p.speaker_id <> $1`, [user.id, c.id]))!,
  })));
  return (
    <>
      <h1>Program committee</h1>
      {!rows.length && <div className="card empty">You haven&apos;t been added to a conference&apos;s program committee yet. An organiser can add you.</div>}
      <div className="grid">
        {rows.map((c) => (
          <article className="card conf-card" key={c.id}>
            <Badge status={`cfp-${c.cfpState}`} label={CFP_LABELS[c.cfpState]} />
            <h2><Link href={`/review/conferences/${c.id}`}>{c.name}</Link></h2>
            <p className="muted">{c.stats.total} active proposal{c.stats.total === 1 ? '' : 's'} · {c.stats.accepted} accepted</p>
            <div className="progress" title={`${c.stats.mine} of ${c.stats.total} reviewed by you`}>
              <span style={{ width: `${c.stats.total ? Math.round((100 * c.stats.mine) / c.stats.total) : 0}%` }} />
            </div>
            <p className="small">You&apos;ve reviewed {c.stats.mine} of {c.stats.total}</p>
            <div className="actions">
              <Link className="btn" href={`/review/conferences/${c.id}?todo=1`}>Review next</Link>
              <Link className="btn btn-ghost" href={`/review/conferences/${c.id}`}>All proposals</Link>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

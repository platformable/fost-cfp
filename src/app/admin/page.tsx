import Link from 'next/link';
import { conferenceStats, listConferences } from '@/lib/conferences';
import { CFP_LABELS, conferenceDates, formatDate } from '@/lib/format';
import { requireRole } from '@/lib/session';
import { Badge } from '@/components/ui';

export const metadata = { title: 'Organiser dashboard' };

export default async function AdminHome() {
  await requireRole(['admin'], '/admin');
  const confs = await listConferences({ includeArchived: true });
  const rows = await Promise.all(confs.map(async (c) => ({ ...c, stats: await conferenceStats(c.id) })));
  const sum = (k: 'total' | 'pending' | 'accepted' | 'confirmed') => rows.reduce((n, c) => n + c.stats[k], 0);
  return (
    <>
      <div className="row-between">
        <h1>Organiser dashboard</h1>
        <div className="actions">
          <Link className="btn btn-ghost" href="/admin/users">People</Link>
          <Link className="btn btn-ghost" href="/admin/exports">Spreadsheet exports</Link>
          <Link className="btn" href="/admin/conferences/new">New conference</Link>
        </div>
      </div>
      {rows.length > 0 && (
        <div className="stats">
          {([['total', 'Proposals'], ['pending', 'Pending decision'], ['accepted', 'Accepted'], ['confirmed', 'Speakers confirmed']] as const).map(([k, label]) => (
            <div className="stat-card" key={k}><span className="stat-num">{sum(k)}</span><span className="stat-label">{label}</span></div>
          ))}
        </div>
      )}
      {!rows.length ? (
        <div className="card empty"><p>No conferences yet.</p><Link className="btn" href="/admin/conferences/new">Create your first conference</Link></div>
      ) : (
        <div className="table-wrap card flush">
          <table>
            <thead><tr><th>Conference</th><th>CFP</th><th className="num">Proposals</th><th className="num">Pending</th><th className="num">Accepted</th><th className="num">Confirmed</th><th className="num">Committee</th><th>Decisions</th><th></th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className={c.archived ? 'dim' : ''}>
                  <td><strong><Link href={`/review/conferences/${c.id}`}>{c.name}</Link></strong><br /><span className="small muted">{conferenceDates(c)}{c.start_date && c.date_precision === 'month' && ' (month only)'}</span></td>
                  <td><Badge status={`cfp-${c.cfpState}`} label={CFP_LABELS[c.cfpState]} />{c.cfp_closes && <><br /><span className="small muted">closes {formatDate(c.cfp_closes)}</span></>}</td>
                  <td className="num">{c.stats.total}</td>
                  <td className="num">{c.stats.pending}</td>
                  <td className="num">{c.stats.accepted}</td>
                  <td className="num">{c.stats.confirmed}</td>
                  <td className="num">{c.stats.reviewers}</td>
                  <td>{c.decisions_published ? 'Published' : 'Hidden'}</td>
                  <td className="nowrap"><Link href={`/review/conferences/${c.id}`}>Proposals</Link> · <Link href={`/admin/conferences/${c.id}`}>Settings</Link> · <a href={`/admin/export/workbook.xlsx?conference=${c.slug}`}>⬇ xlsx</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

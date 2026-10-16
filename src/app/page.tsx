import Link from 'next/link';
import { listConferences } from '@/lib/conferences';
import { CFP_LABELS, dateRange, formatDate } from '@/lib/format';
import { currentUser } from '@/lib/session';
import { Badge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [conferences, user] = await Promise.all([listConferences(), currentUser()]);
  const openCount = conferences.filter((c) => c.cfpOpen).length;
  return (
    <>
      <section className="hero">
        <span className="eyebrow">Call for speakers</span>
        <h1>Speak at <span className="hl">FOST</span></h1>
        <p>Share what you know with the people who build software, APIs and AI. Pick a conference, submit a proposal, and keep it up to date right up to the event. Our program committee reviews every submission.</p>
        <div className="hero-foot">
          {!user ? (
            <div className="actions">
              <Link className="btn" href="/register">Create an account to submit</Link>
              <Link className="btn btn-on-dark" href="/login">Sign in</Link>
            </div>
          ) : openCount > 0 ? (
            <div className="actions"><Link className="btn" href="/proposals/new">Submit a proposal</Link></div>
          ) : <div />}
          <div className="hero-stat"><span className="stat-num">{openCount}</span><span className="stat-label">Open call{openCount === 1 ? '' : 's'}</span></div>
        </div>
      </section>
      {!conferences.length && (
        <div className="card empty">
          No calls for proposals are listed yet.{' '}
          {user?.role === 'admin' && <Link href="/admin/conferences/new">Create the first conference</Link>}
        </div>
      )}
      <div className="grid">
        {conferences.map((c) => (
          <article className="card conf-card" key={c.id}>
            <div className="row-between">
              <Badge status={`cfp-${c.cfpState}`} label={CFP_LABELS[c.cfpState]} />
              {c.cfp_closes && <span className="muted small">Closes {formatDate(c.cfp_closes)}</span>}
            </div>
            <h2><Link href={`/cfp/${c.slug}`}>{c.name}</Link></h2>
            <p className="muted">{[dateRange(c.start_date, c.end_date), c.location].filter(Boolean).join(' · ')}</p>
            <p className="clamp">{c.description}</p>
            <div className="actions">
              <Link className="btn btn-ghost" href={`/cfp/${c.slug}`}>Details</Link>
              {c.cfpOpen && <Link className="btn" href={`/proposals/new?conference=${c.slug}`}>Submit a proposal</Link>}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

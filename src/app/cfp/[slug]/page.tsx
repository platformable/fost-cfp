import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getConference } from '@/lib/conferences';
import { CFP_LABELS, dateRange, formatDate, safeUrl } from '@/lib/format';
import { Badge, Prose } from '@/components/ui';

export default async function ConferencePage({ params }: { params: Promise<{ slug: string }> }) {
  const conf = await getConference((await params).slug);
  if (!conf || conf.archived) notFound();
  const website = safeUrl(conf.website);
  return (
    <section className="card">
      <Badge status={`cfp-${conf.cfpState}`} label={CFP_LABELS[conf.cfpState]} />
      <h1>{conf.name}</h1>
      <p className="muted">
        {[dateRange(conf.start_date, conf.end_date), conf.location].filter(Boolean).join(' · ')}
        {website && <> · <a href={website} target="_blank" rel="noopener">Website</a></>}
      </p>
      <Prose>{conf.description}</Prose>
      <dl className="facts">
        {conf.cfp_opens && <><dt>CFP opens</dt><dd>{formatDate(conf.cfp_opens)}</dd></>}
        {conf.cfp_closes && <><dt>CFP closes</dt><dd>{formatDate(conf.cfp_closes)} (end of day)</dd></>}
        {conf.topicList.length > 0 && <><dt>Topics</dt><dd>{conf.topicList.join(' · ')}</dd></>}
        <dt>Session formats</dt><dd>{conf.formatList.join(' · ')}</dd>
        {conf.blind_review && <><dt>Review</dt><dd>Anonymous: reviewers do not see speaker names. Keep identifying details out of your abstract.</dd></>}
      </dl>
      {conf.cfpOpen && <Link className="btn" href={`/proposals/new?conference=${conf.slug}`}>Submit a proposal</Link>}
    </section>
  );
}

import Link from 'next/link';
import { submitProposalAction } from '@/actions/proposals';
import { LEVELS, openConferences } from '@/lib/conferences';
import { toFormConference } from '@/lib/form-conferences';
import { requireUser } from '@/lib/session';
import { ProposalForm } from '@/components/ProposalForm';

export const metadata = { title: 'Submit a proposal' };

export default async function NewProposal({ searchParams }: { searchParams: Promise<{ conference?: string }> }) {
  const { conference } = await searchParams;
  await requireUser(`/proposals/new${conference ? `?conference=${encodeURIComponent(conference)}` : ''}`);
  const open = await openConferences();
  if (!open.length) {
    return (
      <>
        <h1>Submit a proposal</h1>
        <div className="card empty">No calls for proposals are open right now. <Link href="/">See all conferences</Link>.</div>
      </>
    );
  }
  const wanted = open.find((c) => c.slug === conference || String(c.id) === conference);
  const selected = wanted ? [wanted.id] : open.length === 1 ? [open[0].id] : [];
  return (
    <>
      <h1>Submit a proposal</h1>
      <p className="muted">Write your proposal once and send it to one or more conferences. Each conference reviews its copy separately, and you can edit each copy on its own later.</p>
      <ProposalForm
        mode="new"
        action={submitProposalAction}
        conferences={open.map(toFormConference)}
        levels={LEVELS}
        initial={{ values: { level: '' }, selected, picks: {} }}
        cancelHref="/proposals"
      />
    </>
  );
}

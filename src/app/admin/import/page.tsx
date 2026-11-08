import Link from 'next/link';
import { sendClaimEmailsAction } from '@/actions/imports';
import { claimEmailCounts, listBatches, topicExceptions } from '@/lib/imports';
import { formatDate } from '@/lib/format';
import { baseUrl } from '@/lib/links';
import { requireRole } from '@/lib/session';
import { SubmitButton } from '@/components/SubmitButton';
import { Errors } from '@/components/ui';

export const metadata = { title: 'Import from Typeform' };
export const dynamic = 'force-dynamic';

const PRODUCTION_URL = 'https://cfp.joinfost.io';

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireRole(['admin'], '/admin/import');
  const { error } = await searchParams;
  const [batches, exceptions, claim] = await Promise.all([listBatches(), topicExceptions(), claimEmailCounts()]);
  const site = baseUrl();
  return (
    <>
      <p><Link href="/admin">← Organiser dashboard</Link></p>
      <h1>Import from Typeform</h1>
      <p>Bring in proposals sent through the Typeform call for speakers. Each response becomes one proposal per conference it ticked. Imports are silent: nobody is emailed and no new-proposal automations run.</p>
      {!site.startsWith(PRODUCTION_URL) && (
        <div className="flash flash-info" role="note">This site is <code>{site}</code>, not the production site ({PRODUCTION_URL}). Only import real speaker data on production; use made-up data here.</div>
      )}
      <Errors errors={error} />

      <section className="card">
        <h2>Upload a Typeform export</h2>
        <p className="small muted">In Typeform: Results → Responses → Download as CSV. You will see a preview before anything is saved.</p>
        <form action="/admin/import/upload" method="post" encType="multipart/form-data" className="inline-form">
          <input type="file" name="file" accept=".csv,text/csv" required aria-label="Typeform CSV export" />
          <button className="btn btn-small">Upload and preview</button>
        </form>
      </section>

      <section className="card" id="exceptions">
        <h2>Topic exceptions</h2>
        {exceptions.length
          ? <p><strong>{exceptions.length}</strong> imported proposal{exceptions.length === 1 ? '' : 's'} need a topic choosing. <Link href="/admin/import/exceptions">Open the list</Link></p>
          : <p className="muted">None: every imported proposal has a topic, or its conference has no topic list.</p>}
      </section>

      <section className="card" id="claim">
        <h2>Claim-your-account emails</h2>
        <p>At the cutover, email every imported guest a link to set a password and see their proposals. Each link lasts 30 days. n8n sends the emails (the <code>claim_account</code> branch).</p>
        <p><strong>{claim.unclaimed}</strong> imported guest{claim.unclaimed === 1 ? ' has' : 's have'} not claimed their account; {claim.alreadySent} of them were already sent a link.</p>
        <form action={sendClaimEmailsAction} className="inline-form">
          <label className="check"><input type="checkbox" name="resend" value="1" /> Also resend to the {claim.alreadySent} already emailed</label>
          <SubmitButton className="btn btn-small" disabled={!claim.unclaimed}
            confirmText="Email claim links now? Speakers will receive them straight away through n8n.">Email claim links</SubmitButton>
        </form>
      </section>

      {batches.length > 0 && (
        <section className="card">
          <h2>Uploads</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>File</th><th>Uploaded</th><th>Status</th><th>Result</th></tr></thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td>{b.status === 'uploaded' ? <Link href={`/admin/import/${b.id}`}>{b.filename}</Link> : b.filename}</td>
                    <td className="small">{formatDate(b.created_at)}</td>
                    <td>{{ uploaded: 'Waiting for you to import', imported: 'Imported', discarded: 'Discarded' }[b.status]}</td>
                    <td className="small">{b.counts ? `${b.counts.proposals} proposals, ${b.counts.new_speakers} new speakers, ${b.counts.topic_exceptions} topic exceptions, ${b.counts.already_imported} already imported` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

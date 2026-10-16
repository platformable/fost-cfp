import Link from 'next/link';
import { headers } from 'next/headers';
import { rotateExportTokenAction } from '@/actions/admin';
import { listConferences } from '@/lib/conferences';
import { ensureSecret } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { SubmitButton } from '@/components/SubmitButton';
import { DownloadTable } from './DownloadTable';

export const metadata = { title: 'Spreadsheet exports' };

export default async function Exports() {
  await requireRole(['admin'], '/admin/exports');
  const [conferences, token, h] = await Promise.all([listConferences({ includeArchived: true }), ensureSecret('export_token'), headers()]);
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const base = (process.env.BASE_URL || `${proto}://${h.get('host')}`).replace(/\/$/, '');
  const api = `${base}/api/export/${token}`;
  return (
    <>
      <p><Link href="/admin">← Organiser dashboard</Link></p>
      <h1>Spreadsheet exports</h1>
      <p>Every dataset is a flat table with stable column names, ready for mail merges, Google Sheets, Excel, Airtable, Zapier, Make or any other workflow tool.</p>

      <section className="card">
        <h2>Download now</h2>
        <DownloadTable conferences={conferences.map((c) => ({ slug: c.slug, name: c.name }))} />
      </section>

      <section className="card">
        <h2>Live links for automation</h2>
        <p>These URLs always return the current data without signing in, so workflow tools can poll them. <strong>Treat them like a password</strong>: they include speaker contact details.</p>
        <div className="table-wrap">
          <table className="code-table">
            <tbody>
              {['submissions', 'program', 'speakers', 'reviews', 'conferences'].map((n) => (
                <tr key={n}><td><strong>{n}</strong></td><td><code>{api}/{n}.csv</code></td></tr>
              ))}
              <tr><td><strong>workbook</strong></td><td><code>{api}/workbook.xlsx</code></td></tr>
            </tbody>
          </table>
        </div>
        <h3>Options</h3>
        <ul>
          <li>Swap <code>.csv</code> for <code>.xlsx</code> or <code>.json</code>.</li>
          <li><code>?conference=&lt;slug&gt;</code> limits to one conference{conferences[0] && <>, e.g. <code>?conference={conferences[0].slug}</code></>}.</li>
          <li><code>?status=accepted</code> (or submitted, waitlisted, rejected, withdrawn) filters by status.</li>
          <li><code>?updated_since=2026-01-31T00:00:00Z</code> returns only rows changed since a time, for incremental syncs.</li>
        </ul>
        <h3>Examples</h3>
        <ul>
          <li><strong>Google Sheets</strong>: in a cell, <code>=IMPORTDATA(&quot;{api}/program.csv&quot;)</code>. The sheet refreshes about every hour.</li>
          <li><strong>Zapier / Make / Power Automate</strong>: schedule an HTTP GET of <code>submissions.json?updated_since=…</code> and branch on <code>status</code>, <code>decisions_published</code> and <code>speaker_confirmation</code> to send acceptance, reminder and logistics emails.</li>
          <li><strong>Mail merge</strong>: download <code>program.xlsx</code> and use <code>speaker_first_name</code>, <code>speaker_email</code>, <code>title</code> and <code>feedback_to_speaker</code> as merge fields.</li>
        </ul>
        <form action={rotateExportTokenAction}>
          <SubmitButton className="linklike danger" confirmText="Regenerate the token? Existing automation links will stop working.">Regenerate secret token</SubmitButton>
        </form>
      </section>
    </>
  );
}

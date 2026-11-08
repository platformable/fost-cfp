import Link from 'next/link';
import { notFound } from 'next/navigation';
import { discardImportAction, runImportAction } from '@/actions/imports';
import { listConferences } from '@/lib/conferences';
import { conferenceMap, getBatch, previewImport, readTypeformExport, type ConferenceMap } from '@/lib/imports';
import { conferenceDates } from '@/lib/format';
import { requireRole } from '@/lib/session';
import { SubmitButton } from '@/components/SubmitButton';
import { Errors } from '@/components/ui';

export const metadata = { title: 'Import preview' };
export const dynamic = 'force-dynamic';

// The preview shows what would be imported with the mapping chosen; "Update preview" reloads it
// with new choices, and "Import" runs it. Nothing is saved before "Import".
export default async function ImportPreview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const id = Number((await params).id);
  await requireRole(['admin'], `/admin/import/${id}`);
  const batch = await getBatch(id);
  if (!batch) notFound();
  if (batch.status !== 'uploaded' || !batch.content) {
    return (
      <>
        <p><Link href="/admin/import">← Import from Typeform</Link></p>
        <h1>{batch.filename}</h1>
        <p>This upload has already been {batch.status}. <Link href="/admin/import">Upload another file</Link>.</p>
      </>
    );
  }
  const query = await searchParams;
  const conferences = await listConferences({ includeArchived: true });
  const { conferenceLabels } = readTypeformExport(batch.content);
  const saved = await conferenceMap();
  // Choice per column: from this page's last "Update preview", else the saved mapping, else a
  // conference with exactly the same name.
  const choice = (label: string, i: number): string => {
    const q = query[`m${i}`];
    if (q === 'skip' || /^\d+$/.test(q ?? '')) return q;
    if (label in saved) return saved[label] === null ? 'skip' : String(saved[label]);
    const same = conferences.find((c) => c.name.trim().toLowerCase() === label.trim().toLowerCase());
    return same ? String(same.id) : '';
  };
  const map: ConferenceMap = {};
  conferenceLabels.forEach((label, i) => {
    const v = choice(label, i);
    if (v === 'skip') map[label] = null; else if (v) map[label] = Number(v);
  });
  const unmappedCount = conferenceLabels.length - Object.keys(map).length;
  const p = await previewImport(batch.content, map);
  const run = runImportAction.bind(null, id);

  return (
    <>
      <p><Link href="/admin/import">← Import from Typeform</Link></p>
      <h1>Preview: {batch.filename}</h1>
      <Errors errors={p.errors} />
      {!p.errors.length && (
        <form method="get" className="form">
          <section className="card">
            <h2>1. Which conference is each Typeform column?</h2>
            <p className="small muted">Choose &quot;Skip&quot; for conferences that are not being imported (for example this year&apos;s Paris events). Your choices are remembered for the next import and for the live sync from n8n.</p>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Typeform column</th><th>Import into</th></tr></thead>
                <tbody>
                  {conferenceLabels.map((label, i) => (
                    <tr key={label}>
                      <td>{label}</td>
                      <td>
                        <select name={`m${i}`} defaultValue={choice(label, i)} aria-label={`Conference for ${label}`}>
                          <option value="">Choose…</option>
                          <option value="skip">Skip (don&apos;t import)</option>
                          {conferences.map((c) => <option key={c.id} value={c.id}>{c.name}{conferenceDates(c) ? ` (${conferenceDates(c)})` : ''}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn btn-ghost btn-small">Update preview</button>
          </section>

          <section className="card">
            <h2>2. What will happen</h2>
            <ul>
              <li><strong>{p.proposals}</strong> proposal{p.proposals === 1 ? '' : 's'} from {p.responses - p.alreadyImported - p.skipped} response{p.responses - p.alreadyImported - p.skipped === 1 ? '' : 's'}</li>
              <li><strong>{p.newSpeakers}</strong> new speaker{p.newSpeakers === 1 ? '' : 's'} (as guests, without a password) and <strong>{p.existingSpeakers}</strong> already in the app (their details are kept)</li>
              {p.alreadyImported > 0 && <li>{p.alreadyImported} response{p.alreadyImported === 1 ? ' was' : 's were'} imported before and will be left alone</li>}
              {p.skipped > 0 && <li>{p.skipped} response{p.skipped === 1 ? ' only ticks' : 's only tick'} conferences you are skipping</li>}
              <li>Nobody is emailed. Proposals keep their Typeform date and appear to the committee straight away.</li>
            </ul>
            {p.exceptionsByConference.length > 0 && (
              <>
                <h3>Topics to choose afterwards</h3>
                <p className="small muted">None of the speaker&apos;s ticked topics is on these conferences&apos; topic lists. They will be imported without a topic and listed under Topic exceptions for you to resolve.</p>
                <ul>{p.exceptionsByConference.map((e) => <li key={e.conference}>{e.conference}: {e.count}</li>)}</ul>
              </>
            )}
            {(p.unmatchedCountries.length > 0 || p.unmatchedGenders.length > 0 || p.droppedLinkedIn.length > 0) && (
              <>
                <h3>Answers that could not be matched</h3>
                <ul className="small">
                  {p.unmatchedCountries.length > 0 && <li>Countries left blank: {p.unmatchedCountries.join(', ')}</li>}
                  {p.unmatchedGenders.length > 0 && <li>Gender answers saved as Other: {p.unmatchedGenders.join(', ')}</li>}
                  {p.droppedLinkedIn.length > 0 && <li>Not LinkedIn addresses, left blank: {p.droppedLinkedIn.join(', ')}</li>}
                </ul>
              </>
            )}
            {unmappedCount > 0 && <p className="flash flash-info">Choose a conference or &quot;Skip&quot; for every Typeform column, then update the preview, before importing.</p>}
            <div className="actions">
              <SubmitButton formAction={run} disabled={unmappedCount > 0}
                confirmText={`Import ${p.proposals} proposals now? Nobody will be emailed.`}>Import {p.proposals} proposal{p.proposals === 1 ? '' : 's'}</SubmitButton>
              <SubmitButton formAction={discardImportAction.bind(null, id)} className="linklike danger">Discard this upload</SubmitButton>
            </div>
          </section>
        </form>
      )}
    </>
  );
}

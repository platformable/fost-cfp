import Link from 'next/link';
import { createApiKeyAction, revokeApiKeyAction } from '@/actions/integrations';
import { listApiKeys } from '@/lib/api-keys';
import { formatDate } from '@/lib/format';
import { baseUrl } from '@/lib/links';
import { requireRole } from '@/lib/session';
import { lastHeartbeat, listEndpoints } from '@/lib/webhooks';
import { SubmitButton } from '@/components/SubmitButton';
import { Badge } from '@/components/ui';
import { ApiKeyForm } from './IntegrationForms';
import { timeAgo, WorkerStatus } from './status';

export const metadata = { title: 'Integrations' };
export const dynamic = 'force-dynamic';

export default async function Integrations() {
  await requireRole(['admin'], '/admin/integrations');
  const [endpoints, keys, beat] = await Promise.all([listEndpoints(), listApiKeys(), lastHeartbeat()]);
  return (
    <>
      <p><Link href="/admin">← Organiser dashboard</Link></p>
      <h1>Integrations</h1>
      <p>Send events to n8n (or any tool that accepts webhooks) the moment something happens, and let those tools read data back with an API key.</p>
      <WorkerStatus beat={beat} />

      <section className="card">
        <div className="row-between">
          <h2>Webhook endpoints</h2>
          <Link className="btn btn-small" href="/admin/integrations/endpoints/new">Add endpoint</Link>
        </div>
        {!endpoints.length ? <p className="muted">No endpoints yet. Add the URL of an n8n Webhook node to start receiving events.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>URL</th><th>Status</th><th className="num">Events</th><th className="num">Waiting</th><th className="num">Failed</th><th>Last delivered</th></tr></thead>
              <tbody>
                {endpoints.map((e) => (
                  <tr key={e.id}>
                    <td><strong><Link href={`/admin/integrations/endpoints/${e.id}`}>{e.name}</Link></strong></td>
                    <td className="small"><code>{e.url}</code></td>
                    <td><Badge status={e.paused ? 'paused' : 'active'} label={e.paused ? 'Paused' : 'Active'} /></td>
                    <td className="num">{e.event_types.length}</td>
                    <td className="num">{e.pending}</td>
                    <td className="num">{e.failed}</td>
                    <td className="small">{timeAgo(e.last_delivered_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" id="keys">
        <h2>API keys</h2>
        <p>n8n uses a key to read speakers, proposals, conferences and committees from <code>{baseUrl()}/api/v1/</code>. Read-only keys are enough for now. Keys do not open the spreadsheet export links, which keep their own token.</p>
        <ApiKeyForm action={createApiKeyAction} />
        {keys.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Key</th><th>Can</th><th>Created</th><th>Last used</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className={k.revoked_at ? 'dim' : ''}>
                    <td><strong>{k.name}</strong></td>
                    <td className="small"><code>{k.prefix}_…</code></td>
                    <td>{k.scope === 'read' ? 'Read' : 'Read and write'}</td>
                    <td className="small">{formatDate(k.created_at)}</td>
                    <td className="small">{timeAgo(k.last_used_at)}</td>
                    <td><Badge status={k.revoked_at ? 'revoked' : 'active'} label={k.revoked_at ? 'Revoked' : 'Active'} /></td>
                    <td>{!k.revoked_at && (
                      <form action={revokeApiKeyAction.bind(null, k.id)} className="inline">
                        <SubmitButton className="linklike danger" confirmText={`Revoke "${k.name}"? Anything using it will stop working.`}>Revoke</SubmitButton>
                      </form>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

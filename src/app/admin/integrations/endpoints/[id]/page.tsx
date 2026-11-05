import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  deleteEndpointAction, pauseEndpointAction, regenerateSecretAction, resendDeliveryAction, sendTestEventAction, updateEndpointAction,
} from '@/actions/integrations';
import { EVENT_LABELS, EVENT_TYPES } from '@/lib/events';
import { formatDate } from '@/lib/format';
import { requireRole } from '@/lib/session';
import { deliveryLog, getEndpoint, lastHeartbeat } from '@/lib/webhooks';
import { SubmitButton } from '@/components/SubmitButton';
import { Badge } from '@/components/ui';
import { EndpointForm, RegenerateSecret } from '../../IntegrationForms';
import { timeAgo, WorkerStatus } from '../../status';

export const dynamic = 'force-dynamic';

const STATUS_LABELS = { pending: 'Waiting', delivered: 'Delivered', failed: 'Failed' } as const;

const when = (iso: string | null) => (iso ? `${formatDate(iso)} ${iso.slice(11, 16)} UTC` : '');

export default async function EndpointPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  await requireRole(['admin'], `/admin/integrations/endpoints/${id}`);
  const endpoint = await getEndpoint(id);
  if (!endpoint) notFound();
  const [log, beat] = await Promise.all([deliveryLog(id), lastHeartbeat()]);
  return (
    <>
      <p><Link href="/admin/integrations">← Integrations</Link></p>
      <div className="row-between">
        <h1>{endpoint.name}</h1>
        <Badge status={endpoint.paused ? 'paused' : 'active'} label={endpoint.paused ? 'Paused' : 'Active'} />
      </div>
      <WorkerStatus beat={beat} />
      <div className="two-col wide-left">
        <section className="card">
          <h2>Settings</h2>
          <EndpointForm action={updateEndpointAction.bind(null, id)} isNew={false}
            eventTypes={EVENT_TYPES.map((type) => ({ type, label: EVENT_LABELS[type] }))}
            initial={{ name: endpoint.name, url: endpoint.url, event_types: endpoint.event_types }} />
        </section>
        <div>
          <section className="card">
            <h2>Check it works</h2>
            <p>Sends a signed <code>test.ping</code> event to this endpoint only.</p>
            <form action={sendTestEventAction.bind(null, id)}><SubmitButton className="btn btn-small">Send test event</SubmitButton></form>
          </section>
          <section className="card">
            <h2>Pause or remove</h2>
            <p>{endpoint.paused
              ? 'Paused: events are being kept for this endpoint and will all be sent when you resume it.'
              : 'Pausing keeps new events for this endpoint and sends them when you resume it.'}</p>
            <form action={pauseEndpointAction.bind(null, id)}>
              <input type="hidden" name="paused" value={endpoint.paused ? '0' : '1'} />
              <SubmitButton className="btn btn-ghost btn-small">{endpoint.paused ? 'Resume' : 'Pause'}</SubmitButton>
            </form>
            <div className="small" style={{ margin: '16px 0 12px' }}><RegenerateSecret action={regenerateSecretAction.bind(null, id)} /></div>
            <form action={deleteEndpointAction.bind(null, id)}>
              <SubmitButton className="linklike danger" confirmText={`Delete "${endpoint.name}"? Events waiting to be sent to it are deleted too.`}>Delete endpoint</SubmitButton>
            </form>
          </section>
        </div>
      </div>

      <section className="card" id="log">
        <h2>Delivery log</h2>
        <p className="small muted">The latest 100 deliveries. Event details are deleted after 30 days. Failed deliveries are retried automatically for about two days.</p>
        {!log.length ? <p className="muted">Nothing sent yet.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Event</th><th>Recorded</th><th>Status</th><th className="num">Attempts</th><th>Last response</th><th>Next try</th><th></th></tr></thead>
              <tbody>
                {log.map((d) => (
                  <tr key={d.id}>
                    <td><code>{d.event_type}</code><br /><span className="small muted">{d.event_id}</span></td>
                    <td className="small nowrap">{when(d.occurred_at)}</td>
                    <td><Badge status={d.status} label={STATUS_LABELS[d.status]} /></td>
                    <td className="num">{d.attempts}</td>
                    <td className="small">{d.last_response_status ? `HTTP ${d.last_response_status}` : d.last_error ?? ''}{d.last_attempt_at && <><br /><span className="muted">{timeAgo(d.last_attempt_at)}</span></>}</td>
                    <td className="small nowrap">{d.status === 'pending' ? (endpoint.paused ? 'When resumed' : when(d.next_attempt_at)) : ''}</td>
                    <td>{d.can_resend && d.status !== 'pending' && (
                      <form action={resendDeliveryAction.bind(null, id, d.id)} className="inline"><SubmitButton className="linklike">Resend</SubmitButton></form>
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

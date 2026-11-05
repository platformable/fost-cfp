import Link from 'next/link';
import { createEndpointAction } from '@/actions/integrations';
import { EVENT_LABELS, EVENT_TYPES } from '@/lib/events';
import { requireRole } from '@/lib/session';
import { EndpointForm } from '../../IntegrationForms';

export const metadata = { title: 'Add webhook endpoint' };

export default async function NewEndpoint() {
  await requireRole(['admin'], '/admin/integrations/endpoints/new');
  return (
    <>
      <p><Link href="/admin/integrations">← Integrations</Link></p>
      <h1>Add webhook endpoint</h1>
      <section className="card">
        <p>Each event is sent as a signed JSON POST. You get a signing secret once the endpoint is added; use it in n8n to check deliveries really come from this app.</p>
        <EndpointForm action={createEndpointAction} isNew
          eventTypes={EVENT_TYPES.map((type) => ({ type, label: EVENT_LABELS[type] }))}
          initial={{ name: '', url: '', event_types: [...EVENT_TYPES] }} />
      </section>
    </>
  );
}

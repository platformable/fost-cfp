'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import type { RevealState } from '@/actions/integrations';
import { SubmitButton } from '@/components/SubmitButton';
import { Errors } from '@/components/ui';

type Action = (s: RevealState, f: FormData) => Promise<RevealState>;

// Shows a secret or key once, with a copy button.
export function Reveal({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flash flash-info" role="status">
      <p style={{ marginTop: 0 }}>{label} <strong>Copy it now: it will not be shown again.</strong></p>
      <div className="inline-form">
        <code className="secret" style={{ overflowWrap: 'anywhere' }}>{value}</code>
        <button type="button" className="btn btn-small" onClick={() => navigator.clipboard?.writeText(value).then(() => setCopied(true))}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {children}
    </div>
  );
}

export function EndpointForm({ action, eventTypes, initial, isNew }: {
  action: Action;
  eventTypes: { type: string; label: string }[];
  initial: { name: string; url: string; event_types: string[] };
  isNew: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  if (state.secret) {
    return (
      <Reveal label="Endpoint added. This is its signing secret: paste it into your n8n workflow to check that deliveries come from this app." value={state.secret}>
        <p style={{ marginBottom: 0 }}><Link className="btn btn-small" href={`/admin/integrations/endpoints/${state.id}`}>I have copied it: open the endpoint</Link></p>
      </Reveal>
    );
  }
  const v = (state.values ?? initial) as { name: string; url: string; event_types: string[] };
  return (
    <form action={formAction} className="form" key={JSON.stringify(state.errors ?? [])}>
      <Errors errors={state.errors} />
      <label>Name <span className="opt">for you, e.g. &quot;n8n production&quot;</span><input name="name" defaultValue={v.name} required /></label>
      <label>Webhook URL <span className="opt">from the n8n Webhook node (Production URL); must start with https://</span>
        <input name="url" type="url" defaultValue={v.url} placeholder="https://n8n.example.com/webhook/…" required /></label>
      <fieldset className="conf-picks">
        <legend>Events to send</legend>
        {eventTypes.map((e) => (
          <label className="check" key={e.type}>
            <input type="checkbox" name="event_types" value={e.type} defaultChecked={v.event_types.includes(e.type)} />{' '}
            {e.label} <span className="small muted"><code>{e.type}</code></span>
          </label>
        ))}
      </fieldset>
      <SubmitButton>{isNew ? 'Add endpoint' : 'Save changes'}</SubmitButton>
    </form>
  );
}

export function RegenerateSecret({ action }: { action: (s: RevealState) => Promise<RevealState> }) {
  const [state, formAction] = useActionState(action, {});
  if (state.secret) return <Reveal label="New signing secret. Deliveries from now on are signed with it, so update your n8n workflow." value={state.secret} />;
  return (
    <form action={formAction}>
      <SubmitButton className="linklike" confirmText="Create a new signing secret? Your n8n workflow will need the new one to check deliveries.">
        Regenerate signing secret
      </SubmitButton>
    </form>
  );
}

export function ApiKeyForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, {});
  const v = (state.values ?? { name: '', scope: 'read' }) as { name: string; scope: string };
  return (
    <>
      {state.secret && <Reveal label="API key created. Use it in n8n as a Bearer token (Header Auth: Authorization = Bearer <key>)." value={state.secret} />}
      <Errors errors={state.errors} />
      <form action={formAction} className="inline-form" style={{ marginBottom: 16 }} key={state.secret ?? JSON.stringify(state.errors ?? [])}>
        <input name="name" placeholder="Key name, e.g. n8n production" defaultValue={state.secret ? '' : v.name} aria-label="Key name" required />
        <select name="scope" defaultValue={v.scope} aria-label="What the key may do">
          <option value="read">Read only</option>
          <option value="read-write">Read and write</option>
        </select>
        <SubmitButton className="btn btn-small">Create API key</SubmitButton>
      </form>
    </>
  );
}

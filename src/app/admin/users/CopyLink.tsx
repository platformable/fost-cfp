'use client';

import { useState, useTransition } from 'react';

// "Copy password link": for when a link email does not arrive. The link is shown once.
export function CopyLink({ action, name, label = 'Copy password link', note = 'Works once, for 24 hours.' }:
{ action: () => Promise<{ url?: string; error?: string }>; name: string; label?: string; note?: string }) {
  const [result, setResult] = useState<{ url?: string; error?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  if (result?.url) {
    return (
      <div className="small" role="status">
        <code className="secret" style={{ overflowWrap: 'anywhere' }}>{result.url}</code>{' '}
        <button type="button" className="linklike" onClick={() => navigator.clipboard?.writeText(result.url!).then(() => setCopied(true))}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <br /><span className="muted">{note} Send it to {name} yourself; it will not be shown again.</span>
      </div>
    );
  }
  return (
    <>
      {result?.error && <span className="small muted">{result.error} </span>}
      <button type="button" className="linklike small" disabled={pending}
        onClick={() => {
          if (!window.confirm(`${label} for ${name}? No email is sent; you send it to them yourself.`)) return;
          start(async () => setResult(await action()));
        }}>
        {label}
      </button>
    </>
  );
}

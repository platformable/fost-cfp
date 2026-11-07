'use client';

import { useState, useTransition } from 'react';

// "Copy password link": for when a link email does not arrive. The link is shown once.
export function CopyLink({ action, name }: { action: () => Promise<{ url?: string; error?: string }>; name: string }) {
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
        <br /><span className="muted">Works once, for 24 hours. Send it to {name} yourself; it will not be shown again.</span>
      </div>
    );
  }
  return (
    <>
      {result?.error && <span className="small muted">{result.error} </span>}
      <button type="button" className="linklike small" disabled={pending}
        onClick={() => {
          if (!window.confirm(`Create a password link for ${name}? Any earlier link they were sent stops working.`)) return;
          start(async () => setResult(await action()));
        }}>
        Copy password link
      </button>
    </>
  );
}

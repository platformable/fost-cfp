// Whether a POST came from one of this site's own pages: the browser's Origin header names the
// same host the request was sent to. Behind a reverse proxy that is X-Forwarded-Host, not the
// internal address Next.js listens on; server actions use the same rule.
export function fromThisSite(headers: Headers): boolean {
  const origin = headers.get('origin');
  if (!origin) return true; // older browsers and same-site form posts without the header
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false; // includes "null"
  }
  const forwarded = headers.get('x-forwarded-host')?.split(',')[0].trim();
  const host = forwarded || headers.get('host');
  return !!host && originHost.toLowerCase() === host.toLowerCase();
}

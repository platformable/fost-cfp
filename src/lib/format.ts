// Display helpers shared by pages.

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Pending decision',
  'under review': 'Under review',
  accepted: 'Accepted',
  waitlisted: 'Waitlisted',
  rejected: 'Not accepted',
  withdrawn: 'Withdrawn',
};

export const CFP_LABELS: Record<string, string> = {
  open: 'CFP open', upcoming: 'CFP opens soon', closed: 'CFP closed', archived: 'Archived',
};

export const statusLabel = (status: string) => STATUS_LABELS[status] ?? status;
export const badgeClass = (status: string) => `badge badge-${String(status).replace(/\s+/g, '-')}`;

export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function dateRange(start: string | null, end: string | null): string {
  if (!start) return '';
  if (!end || end === start) return formatDate(start);
  return `${formatDate(start)} – ${formatDate(end)}`;
}

// Only allow http(s) links in user-supplied URLs (blocks javascript: and friends).
export function safeUrl(value: string | null | undefined): string {
  const s = String(value ?? '').trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(s)) return `https://${s}`;
  return '';
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

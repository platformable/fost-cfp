import { formatDate } from '@/lib/format';

const STALE_MS = 5 * 60_000;

export function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return formatDate(iso);
}

// Warns when the delivery worker has not checked in for a few minutes.
export function WorkerStatus({ beat }: { beat: string | null }) {
  const ok = !!beat && Date.now() - Date.parse(beat) < STALE_MS;
  return ok
    ? <p className="small muted">Delivery worker last checked in {timeAgo(beat)}.</p>
    : (
      <div className="flash flash-error" role="alert">
        {beat ? `The delivery worker last checked in ${timeAgo(beat)}.` : 'The delivery worker has never run.'}{' '}
        Events are being kept, but nothing is sent until it runs (<code>npm run worker</code> next to the web server).
      </div>
    );
}

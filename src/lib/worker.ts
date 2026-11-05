// The webhook delivery loop, run by scripts/worker.ts (npm run worker) next to the web server.
// Wakes on PostgreSQL NOTIFY when an event is recorded, and polls every few seconds as a fallback.
import pg from 'pg';
import { databaseUrl } from './db';
import { NOTIFY_CHANNEL } from './events';
import { deliverDue, heartbeat, purgeOldPayloads } from './webhooks';

export interface WorkerOptions {
  signal: AbortSignal;
  pollMs?: number;
  batch?: number;
  log?: (msg: string) => void;
}

const DAY_MS = 86_400_000;
const HEARTBEAT_MS = 30_000;

export async function runWorker({ signal, pollMs = 5000, batch = 10, log = () => {} }: WorkerOptions): Promise<void> {
  let wake: (() => void) | null = null;
  const nudge = () => { const w = wake; wake = null; w?.(); };
  signal.addEventListener('abort', nudge);

  // A dedicated connection for LISTEN; if it drops, polling carries on and we reconnect.
  let listener: pg.Client | null = null;
  const listen = async () => {
    try {
      listener = new pg.Client({ connectionString: databaseUrl() });
      listener.on('notification', nudge);
      listener.on('error', (err) => { log(`Listen connection lost: ${err.message}`); listener = null; });
      await listener.connect();
      await listener.query(`LISTEN ${NOTIFY_CHANNEL}`);
    } catch (err) {
      log(`Could not listen for new events (${(err as Error).message}); polling instead.`);
      listener = null;
    }
  };
  await listen();

  let lastBeat = 0;
  let lastPurge = 0;
  while (!signal.aborted) {
    try {
      const now = Date.now();
      if (now - lastBeat >= HEARTBEAT_MS) { await heartbeat(); lastBeat = now; }
      if (now - lastPurge >= DAY_MS) {
        const n = await purgeOldPayloads();
        if (n) log(`Removed payloads of ${n} event(s) older than 30 days.`);
        lastPurge = now;
      }
      let sent: number;
      do {
        sent = await deliverDue(batch);
        if (sent) log(`Attempted ${sent} deliver${sent === 1 ? 'y' : 'ies'}.`);
      } while (sent === batch && !signal.aborted);
    } catch (err) {
      log(`Delivery pass failed: ${(err as Error).message}`);
    }
    if (signal.aborted) break;
    if (!listener) await listen();
    await new Promise<void>((resolve) => {
      wake = resolve;
      setTimeout(nudge, pollMs);
    });
  }
  signal.removeEventListener('abort', nudge);
  await (listener as pg.Client | null)?.end().catch(() => {});
}

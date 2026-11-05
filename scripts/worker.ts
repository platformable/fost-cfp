// Delivers webhook events to the endpoints organisers register. Run it next to the web server:
//   npm run worker
// Stop it with Ctrl+C (or SIGTERM from systemd or Docker); it finishes the current batch first.
import './env';
import { closePool } from '../src/lib/db';
import { runWorker } from '../src/lib/worker';

async function main() {
  const controller = new AbortController();
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => { console.log(`[worker] ${sig} received, stopping…`); controller.abort(); });
  }
  console.log('[worker] Delivering webhook events. Press Ctrl+C to stop.');
  await runWorker({ signal: controller.signal, log: (msg) => console.log(`[worker] ${msg}`) });
  await closePool();
  console.log('[worker] Stopped.');
}

main().catch(async (err) => {
  console.error(err);
  await closePool();
  process.exit(1);
});

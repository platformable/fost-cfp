import './env';
import { closePool, pool } from '../src/lib/db';
import { migrate } from '../src/lib/migrate';

async function main() {
  const applied = await migrate(pool(), console.log);
  console.log(applied.length ? `Done: ${applied.length} migration(s) applied.` : 'Database is up to date.');
  await closePool();
}

main().catch(async (err) => {
  console.error(err);
  await closePool();
  process.exit(1);
});

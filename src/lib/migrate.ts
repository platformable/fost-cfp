import fs from 'node:fs';
import path from 'node:path';
import type pg from 'pg';

const DIR = path.join(process.cwd(), 'db', 'migrations');

// Applies db/migrations/*.sql in name order, each once, each in its own transaction.
export async function migrate(client: pg.Pool | pg.PoolClient, log: (msg: string) => void = () => {}): Promise<string[]> {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const done = new Set((await client.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version));
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(DIR, file), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    }
    applied.push(file);
    log(`Applied ${file}`);
  }
  return applied;
}

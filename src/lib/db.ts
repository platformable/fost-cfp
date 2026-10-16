import crypto from 'node:crypto';
import pg from 'pg';

// Keep DATE columns as 'YYYY-MM-DD' strings, timestamps as ISO strings (UTC, no milliseconds),
// and counts/averages as numbers, so rows can go straight into pages and spreadsheets.
pg.types.setTypeParser(1082, (v: string) => v);
pg.types.setTypeParser(1184, (v: string) => new Date(v).toISOString().replace(/\.\d{3}Z$/, 'Z'));
pg.types.setTypeParser(1114, (v: string) => new Date(`${v}Z`).toISOString().replace(/\.\d{3}Z$/, 'Z'));
pg.types.setTypeParser(20, (v: string) => Number(v));
pg.types.setTypeParser(1700, (v: string) => Number(v));

type Queryable = Pick<pg.Pool, 'query'> | pg.PoolClient;

const globalForPool = globalThis as unknown as { fostPool?: pg.Pool };

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  return url;
}

// One pool per process; reused across hot reloads in development.
export function pool(): pg.Pool {
  if (!globalForPool.fostPool) {
    globalForPool.fostPool = new pg.Pool({ connectionString: databaseUrl(), max: 10 });
  }
  return globalForPool.fostPool;
}

export async function closePool(): Promise<void> {
  if (globalForPool.fostPool) {
    await globalForPool.fostPool.end();
    globalForPool.fostPool = undefined;
  }
}

export async function query<T = Record<string, any>>(sql: string, params: unknown[] = [], db: Queryable = pool()): Promise<T[]> {
  const res = await db.query(sql, params as any[]);
  return res.rows as T[];
}

export async function one<T = Record<string, any>>(sql: string, params: unknown[] = [], db: Queryable = pool()): Promise<T | null> {
  const rows = await query<T>(sql, params, db);
  return rows[0] ?? null;
}

export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getSetting(key: string): Promise<string | null> {
  const row = await one<{ value: string }>('SELECT value FROM settings WHERE key = $1', [key]);
  return row ? row.value : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, value]);
}

// Returns the stored value, generating and saving a random one on first use.
export async function ensureSecret(key: string): Promise<string> {
  const fresh = crypto.randomBytes(24).toString('hex');
  await query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, fresh]);
  return (await getSetting(key)) as string;
}

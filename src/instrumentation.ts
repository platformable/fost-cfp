// Runs once when the Next.js server starts: brings the database schema up to date.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { pool } = await import('./lib/db');
  const { migrate } = await import('./lib/migrate');
  await migrate(pool(), (msg) => console.log(`[db] ${msg}`));
}

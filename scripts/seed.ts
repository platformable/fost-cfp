// Loads demo data: npm run db:seed
// Accounts (password for all: password123):
//   admin@example.com (organiser), reviewer1@example.com, reviewer2@example.com,
//   ada@example.com, grace@example.com, linus@example.com (speakers)
import './env';
import { closePool, one, pool, query } from '../src/lib/db';
import { hashPassword } from '../src/lib/auth';
import { migrate } from '../src/lib/migrate';

async function main() {
  await migrate(pool());
  if (await one('SELECT 1 FROM users LIMIT 1')) {
    console.log('The database already has data; skipping the seed. Use an empty database to load the demo.');
    await closePool();
    return;
  }

  const iso = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const pw = hashPassword('password123');

  async function user(email: string, first: string, last: string, role: string, extra: Record<string, string> = {}) {
    const row = await one<{ id: number }>(`INSERT INTO users (email, password_hash, first_name, last_name, role, organization, job_title, bio, country)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [email, pw, first, last, role, extra.organization ?? '', extra.job_title ?? '', extra.bio ?? '', extra.country ?? '']);
    return row!.id;
  }

  await user('admin@example.com', 'Olive', 'Organiser', 'admin');
  const r1 = await user('reviewer1@example.com', 'Rhea', 'Reviewer', 'reviewer', { organization: 'Acme' });
  const r2 = await user('reviewer2@example.com', 'Ravi', 'Reviewer', 'reviewer', { organization: 'Globex' });
  const ada = await user('ada@example.com', 'Ada', 'Lovelace', 'speaker', { organization: 'Analytical Engines Ltd', job_title: 'Principal Engineer', bio: 'Ada writes programs for machines that do not exist yet.', country: 'GB' });
  const grace = await user('grace@example.com', 'Grace', 'Hopper', 'speaker', { organization: 'US Navy', job_title: 'Rear Admiral', bio: 'Grace popularised the idea of machine-independent programming languages.', country: 'US' });
  const linus = await user('linus@example.com', 'Linus', 'Torvalds', 'speaker', { organization: 'Linux Foundation', job_title: 'Fellow', bio: 'Linus maintains a small hobby kernel.', country: 'FI' });

  async function conf(name: string, slug: string, o: Record<string, string | number | boolean>) {
    const row = await one<{ id: number }>(`INSERT INTO conferences (name, slug, description, location, start_date, end_date, cfp_opens, cfp_closes, topics, blind_review)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [name, slug, o.description, o.location, iso(Number(o.start)), iso(Number(o.end)), iso(Number(o.opens)), iso(Number(o.closes)), o.topics, !!o.blind]);
    return row!.id;
  }

  const apiConf = await conf('APIDays Europe 2027', 'apidays-europe-2027', {
    description: 'Two days of talks and workshops on API design, platforms and AI integrations.',
    location: 'Paris, France', start: 120, end: 121, opens: -30, closes: 30,
    topics: 'API Design\nPlatform Engineering\nAI & Agents\nSecurity',
  });
  const osConf = await conf('Open Source Summit 2027', 'oss-summit-2027', {
    description: 'Community-driven conference for open source maintainers and contributors.',
    location: 'Online', start: 200, end: 202, opens: -10, closes: 60,
    topics: 'Maintainership\nCommunity\nTooling', blind: true,
  });

  // A conference whose call is open while only the month is known (shown as e.g. "June 2027").
  const monthStart = new Date(Date.now() + 240 * 86400000);
  await query(`INSERT INTO conferences (name, slug, description, location, start_date, date_precision, cfp_opens, cfp_closes, topics)
    VALUES ($1, $2, $3, $4, $5, 'month', $6, $7, $8)`,
  ['FOST GreenIO Summit', 'greenio-summit', 'Sustainable software, green IT and the energy cost of AI.', 'Paris, France',
    `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}-01`, iso(-5), iso(120),
    'Measuring software energy use\nGreen cloud and data centres\nSustainable AI']);

  for (const [c, u] of [[apiConf, r1], [apiConf, r2], [osConf, r1]]) {
    await query('INSERT INTO conference_reviewers (conference_id, user_id) VALUES ($1, $2)', [c, u]);
  }

  async function proposal(c: number, speaker: number, title: string, format: string, topic: string, abstract: string) {
    const row = await one<{ id: number }>(`INSERT INTO proposals (conference_id, speaker_id, title, abstract, format, topic, level)
      VALUES ($1, $2, $3, $4, $5, $6, 'Intermediate') RETURNING id`, [c, speaker, title, abstract, format, topic]);
    await query(`INSERT INTO proposal_history (proposal_id, user_id, action) VALUES ($1, $2, 'submitted')`, [row!.id, speaker]);
    return row!.id;
  }

  const p1 = await proposal(apiConf, ada, 'Designing APIs for engines that do not exist yet', 'Talk (30 min)', 'API Design', 'How to design interfaces that outlive their first implementation.');
  const p2 = await proposal(apiConf, grace, 'Compilers, contracts and the OpenAPI spec', 'Talk (30 min)', 'Platform Engineering', 'Treat your API description as a compiler input and generate everything else.');
  const p3 = await proposal(apiConf, linus, 'Saying no to API changes', 'Lightning talk (10 min)', 'API Design', 'A short guide to not breaking userspace.');
  await proposal(apiConf, ada, 'Hands-on: agents calling your API safely', 'Workshop (90 min)', 'AI & Agents', 'Build a tool-using agent against a sandboxed API.');
  await proposal(osConf, linus, 'Maintainer burnout and how to avoid it', 'Talk (30 min)', 'Maintainership', 'Lessons from three decades of reviewing patches.');

  const review = (p: number, r: number, score: number, rec: string, comments: string) =>
    query('INSERT INTO reviews (proposal_id, reviewer_id, score, recommendation, comments) VALUES ($1, $2, $3, $4, $5)', [p, r, score, rec, comments]);
  await review(p1, r1, 5, 'accept', 'Great fit for the design topic.');
  await review(p1, r2, 4, 'accept', 'Strong speaker, clear outline.');
  await review(p2, r1, 3, 'maybe', 'Interesting but overlaps with last year.');
  await review(p3, r2, 2, 'reject', 'Too short to be useful.');
  await query(`UPDATE proposals SET status = 'accepted', decided_at = now() WHERE id = $1`, [p1]);

  console.log('Seeded demo data. Sign in as admin@example.com / password123');
  await closePool();
}

main().catch(async (err) => {
  console.error(err);
  await closePool();
  process.exit(1);
});

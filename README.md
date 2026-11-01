# FOST Call for Speakers

A web app for running calls for proposals across one or more FOST conferences, built with **Next.js** (App Router, server actions) and **PostgreSQL**.

- **Speakers** create an account and write a proposal once, then send it to one or more conferences, choosing a session format and topic for each. Each conference reviews its copy separately. Speakers can keep editing right up to the day before the conference, and each proposal shows how much time is left. Once accepted, they confirm or decline their slot.
- **The program review committee** scores each proposal from 1 to 5, recommends accept, maybe or reject, and leaves comments. Reviewers see colleagues' reviews only after submitting their own. Anonymous review can be switched on per conference.
- **Organisers (admins)** create conferences (dates, call window, topics, session formats), choose the committee, make decisions one at a time or in bulk, write a message to each speaker, and choose when decisions become visible to speakers.
- **Everything exports to spreadsheets** (`.xlsx`, `.csv` and `.json`) with stable column names, ready for mail merges, Google Sheets, Zapier, Make, Power Automate and similar tools.

## Run it locally

You need **Node.js 20.9 or newer** and **PostgreSQL 14 or newer**.

### 1. Get PostgreSQL running

Pick one:

- **Docker:** run PostgreSQL in a container with user `fost`, password `fost` and database `fost_cfp`, for example `docker run -d -p 5432:5432 -e POSTGRES_USER=fost -e POSTGRES_PASSWORD=fost -e POSTGRES_DB=fost_cfp postgres:17`.
- **Postgres.app (Mac):** install it from postgresapp.com, start it, then run `createdb fost_cfp`.
- **Homebrew (Mac):** `brew install postgresql@17 && brew services start postgresql@17 && createdb fost_cfp`.

### 2. Configure and start the app

```bash
npm install
cp .env.example .env     # then edit DATABASE_URL if yours differs
npm run db:seed          # optional: demo conferences, speakers and proposals
npm run dev              # http://localhost:3000
```

The database tables are created automatically the first time the app starts (and by `npm run db:seed`). Run `npm run db:migrate` to apply schema updates on their own.

With Postgres.app or Homebrew, your `DATABASE_URL` is usually `postgres://YOUR_MAC_USERNAME@localhost:5432/fost_cfp` (no password).

On a fresh database without the demo data, **the first account you register becomes the organiser (admin)**. Everyone after that is a speaker. Admins add reviewers on each conference's settings page, or change roles under **Organise → People**.

Demo accounts created by `npm run db:seed` (password `password123` for all):

| Email | Role |
| --- | --- |
| admin@example.com | Organiser |
| reviewer1@example.com, reviewer2@example.com | Reviewers |
| ada@example.com, grace@example.com, linus@example.com | Speakers |

### Production

`next.config.ts` uses `output: 'standalone'`, so `npm run build` produces a self-contained server in `.next/standalone` for the Docker image. The Dockerfile and docker-compose file used for deployment are kept outside this repository. To run a production build directly:

```bash
npm run build
cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/
node .next/standalone/server.js
```

Serve it over HTTPS. Session cookies are marked `Secure` when `NODE_ENV=production`.

### Configuration (environment variables)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (required) |
| `BASE_URL` | Public address of the app, used in exported links (`proposal_url`, `review_url`) and on the exports page. On the test server: `https://dev-cfp.platformable.com` |
| `PORT` | Port for `npm start` / `npm run dev` (default 3000) |
| `TEST_DATABASE_URL` | Database for `npm test`; **it is wiped on every run** (default `postgres://fost:fost@localhost:5432/fost_cfp_test`) |

## Proposal lifecycle

```
submitted ──► accepted ──► speaker confirmed / declined
     │    └─► waitlisted
     │    └─► rejected
     └──────► withdrawn (by the speaker, at any time)
```

- New proposals can only be submitted while a conference's call is open. Speakers can keep editing until the day before the conference starts (no start date means no deadline).
- A conference can open its call while only its month is known: choose **Month only** under Conference dates, and speakers see, for example, "June 2027". Until exact dates are added, speakers can keep editing and their proposals say "Edit deadline set once dates are confirmed". Switch to **Exact dates** when the days are confirmed. Each edit bumps `version` and is logged in the proposal history.
- Until an organiser clicks **Publish decisions to speakers**, speakers see "Under review".
- Changing a decision away from accepted clears the speaker's confirmation.

## Spreadsheet exports

Go to **Organise → Spreadsheet exports**. Datasets, one row per item:

| Dataset | Use it for |
| --- | --- |
| `submissions` | Everything about each proposal: talk details, topic, speaker contact details and country, status, decision visibility, confirmation, message to the speaker, review count, average score and votes, timestamps, links |
| `program` | Accepted talks only, with speaker bio, country, headshot (`speaker_headshot_source`: their photo URL, or their LinkedIn photo if they gave none) and confirmation status |
| `speakers` | One row per speaker with counts of proposals by outcome |
| `reviews` | One row per review |
| `conferences` | Settings and headline numbers |
| `workbook` | All of the above as tabs in one `.xlsx` file |

Signed-in admins download from `/admin/export/<dataset>.<csv|xlsx|json>`. For automation, the same files are served from a secret-token URL that needs no login:

```
/api/export/<token>/<dataset>.<csv|xlsx|json>?conference=<slug>&status=<status>&updated_since=<ISO time>
```

- **Google Sheets:** `=IMPORTDATA("https://your-host/api/export/<token>/program.csv")`
- **Zapier, Make, Power Automate or cron:** poll `submissions.json?updated_since=<last run>` and branch on `status`, `decisions_published` and `speaker_confirmation`.
- **Mail merge:** download `program.xlsx` and merge on `speaker_first_name`, `speaker_email`, `title` and `feedback_to_speaker`.

The token is shown on the exports page and can be regenerated there. Treat it like a password. In CSV output, cells that start with `=`, `+`, `-` or `@` are prefixed with `'` so spreadsheets don't run user-entered text as a formula.

## Planning changes with OpenSpec

This repo uses [OpenSpec](https://github.com/Fission-AI/OpenSpec) for spec-driven changes: agree what to build in writing first, then implement it. The CLI is pinned as a dev dependency (`npx openspec …`, version 1.14.3; it needs Node.js 22.12 or newer).

- `openspec/specs/` holds the agreed behaviour of the app; `openspec/changes/` holds proposed changes (proposal, spec deltas, design, tasks) until they ship and are archived.
- `openspec/config.yaml` lists the project rules every proposal must respect, such as export columns being a contract with outside automations.
- In Claude Code, use `/opsx:propose <idea>` to draft a change, `/opsx:apply` to implement it, and `/opsx:archive` once it has shipped. `/opsx:explore`, `/opsx:update` and `/opsx:sync` are also available.

## Development

```bash
npm run dev         # development server with hot reload
npm run typecheck   # TypeScript
npm test            # integration tests against TEST_DATABASE_URL (wiped each run)
```

Code layout:

```
db/migrations/        SQL schema, applied in order (tracked in schema_migrations)
src/lib/              Business logic, independent of Next.js
  db.ts               pg pool, query helpers, transactions, settings
  auth.ts             password hashing, database-backed sessions
  conferences.ts      conferences, call windows, committees
  proposals.ts        submission, edit window, decisions, reviews
  users.ts            registration, profiles, roles
  export.ts           spreadsheet datasets and CSV/XLSX writers
  session.ts          Next.js glue: current user, guards, flash messages
src/actions/          Server actions (every change goes through these, with role checks)
src/app/              Pages and routes (App Router)
src/components/       Shared UI, including the multi-conference proposal form
scripts/              db:migrate and db:seed
test/                 Integration tests
```

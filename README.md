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

Setting up the permanent production site (cfp.joinfost.io)? Follow [docs/production-setup.md](docs/production-setup.md).

### The webhook worker (second process)

Webhook events are sent by a separate process, not the web server. Run it next to the web server, with the same `DATABASE_URL`, from a full checkout of this repository (`npm ci` installs what it needs; the `.next/standalone` folder alone is not enough):

```bash
npm run worker
```

It wakes as soon as an event is recorded, retries failed deliveries for about two days, and deletes event details older than 30 days. If it is not running, nothing is lost: events wait in the database and are sent once it starts. **Organise → Integrations** shows when it last checked in and warns if that was more than five minutes ago. It is safe to run more than one copy.

On OVHcloud or Scaleway, run it the same way you run the web server:

- **Docker Compose:** add a second service to the deployment's `docker-compose.yml` that uses the same image and environment as the web service, with `command: npm run worker` and `restart: unless-stopped`. The image must contain the repository source and `node_modules`, not only the standalone build.
- **systemd on a VPS:** a second unit with `WorkingDirectory=/path/to/fost-cfp`, `EnvironmentFile=/path/to/.env`, `ExecStart=/usr/bin/npm run worker` and `Restart=always`.

In production the worker refuses to send to private, loopback and link-local addresses (so a webhook URL cannot be used to reach internal services). Set `ALLOW_PRIVATE_WEBHOOKS=1` only if n8n runs on the same private network and you trust everyone who can sign in as an organiser.

### Configuration (environment variables)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (required) |
| `BASE_URL` | Public address of the app, used in exported links (`proposal_url`, `review_url`) and on the exports page. On the test server: `https://dev-cfp.platformable.com` |
| `PORT` | Port for `npm start` / `npm run dev` (default 3000) |
| `TEST_DATABASE_URL` | Database for `npm test`; **it is wiped on every run** (default `postgres://fost:fost@localhost:5432/fost_cfp_test`) |
| `ALLOW_PRIVATE_WEBHOOKS` | Set to `1` to let the worker send webhooks to private network addresses in production (off by default) |

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

### Guest submissions

Speakers can apply without an account: signed out, the proposal form asks for their name, email and organisation instead. A guest proposal is saved as **awaiting confirmation** and the speaker is emailed a confirmation link (through n8n, below). Until they use it, the proposal:

- is not shown to the committee and is left out of every export, the API and conference counts;
- sets off no automations (no `proposal.submitted`).

Organisers only see how many are waiting, on the organiser dashboard, and on **Organise → People** can copy a confirmation link if the email does not arrive. When the speaker confirms, the proposals count as submitted at their original time, and `speaker.registered` (first time) and `proposal.submitted` (one per conference) are sent as usual.

Guests have no password, so they cannot sign in or edit. They can set one when they confirm, or later with **Forgot your password?** or by registering with the same email: both email them a link to claim the account. In events and exports, `account_status` is `guest` until then, `active` after. If the email already belongs to an account, the confirmed proposal joins that account. The form shows the same message either way.

Anti-bot check, with no captcha: a hidden field people never fill in, at least 3 seconds on the form, and at most 5 proposals awaiting confirmation per email address. Proposals still unconfirmed after 6 months, and guest accounts left with nothing, are deleted by the worker.

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

## Integrations: webhooks and the API (n8n)

Go to **Organise → Integrations** (organisers only). Two things live there:

- **Webhook endpoints:** the app POSTs a signed JSON event to each endpoint the moment something happens. Choose which events each endpoint gets, pause it (events are kept and sent when you resume), send a test event, and see every delivery with its response.
- **API keys:** let n8n read data back from `/api/v1/`. A key is shown once when it is created.

### Events

| Event | When |
| --- | --- |
| `speaker.registered` | A speaker creates an account (not the first, organiser, account) |
| `speaker.profile_updated` | A speaker saves a changed profile; `data.changed_fields` lists what changed |
| `proposal.submitted` | A proposal is submitted; one event per conference it was sent to |
| `proposal.updated` | A speaker saves a changed proposal; `data.changed_fields` lists what changed |
| `proposal.withdrawn` | A speaker withdraws a proposal |
| `proposal.speaker_confirmed` / `proposal.speaker_declined` | A speaker answers an accepted proposal |
| `email_link.requested` | A password reset or committee invite link needs emailing; see [Emailed links](#emailed-links-password-resets-and-invites). Only sent to endpoints that tick it |
| `test.ping` | "Send test event" on an endpoint's page |

Every delivery body looks like this:

```json
{
  "id": "5cf10300-b2a0-4e5e-835e-f7036cc940da",
  "type": "proposal.submitted",
  "version": 1,
  "occurred_at": "2027-01-15T10:30:00Z",
  "data": { "proposal": { "id": 42, "title": "…", "status": "under review", "speaker": { "…": "…" }, "conference": { "…": "…" } } }
}
```

`data.proposal` (or `data.speaker` for speaker events) contains everything n8n usually needs: the talk, the speaker's name, email, job title, organisation, bio, LinkedIn URL, country and headshot, and the conference, including `date_precision` (`day`, or `month` while only the month is known). The status is what the speaker sees, so an unpublished decision shows as `under review`; internal notes, reviews and scores are never sent.

Each delivery carries `X-FOST-Event-Id`, `X-FOST-Event-Type`, `X-FOST-Timestamp` (Unix seconds) and `X-FOST-Signature`: `sha256=` followed by the hex HMAC-SHA256 of `<timestamp>.<raw body>`, keyed with the endpoint's signing secret. Only a 2xx answer within 10 seconds counts as delivered; anything else is retried after about 1 min, 5 min, 15 min, 1 h, 3 h, 6 h, 12 h and 24 h, then marked failed. A delivery can arrive more than once, so de-duplicate by `id`.

### Receiving events in n8n

1. Add a **Webhook** node: method `POST`, and under **Options** turn on **Raw Body** (the signature is checked against the exact bytes sent). Activate (or publish) the workflow, then paste its **Production URL** into a new endpoint under Organise → Integrations, and keep the signing secret it shows you.
   - Copy the URL from the Webhook node itself. It looks like `https://<your-n8n>/webhook/<path>`, not the `https://<your-n8n>/workflow/…` address of the editor page, and not the Test URL (`/webhook-test/…`), which only works while n8n is listening for a test.
   - On a self-hosted n8n, set `WEBHOOK_URL=https://<your-n8n>/` if the Production URL shows `localhost`.
   - To check the URL is live, run `curl -i --max-time 15 -X POST -H "Content-Type: application/json" -d "{}" "https://<your-n8n>/webhook/<path>"`. A 200 means it is listening (that run then fails the signature check, as it should); a 404 means the workflow is not active or published, or the path or method is different.
2. Add a **Code** node after it (Language: **JavaScript**, not Python; mode: *Run Once for All Items*) to check the signature. The Code node needs Node's `crypto` module: set `NODE_FUNCTION_ALLOW_BUILTIN=crypto` in n8n's environment and restart n8n. Store the secret as an n8n variable or environment variable rather than in the code if you can.

   ```js
   // Checks that a webhook really came from FOST Call for Speakers, then outputs the event.
   const crypto = require('crypto');
   const secret = 'whsec_paste_your_signing_secret_here';

   const headers = $input.first().json.headers;
   const raw = (await this.helpers.getBinaryDataBuffer(0, 'data')).toString('utf8');
   const timestamp = headers['x-fost-timestamp'];
   const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
   const given = String(headers['x-fost-signature'] || '');
   if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
     throw new Error('Signature does not match: this request did not come from FOST Call for Speakers.');
   }
   if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
     throw new Error('Webhook is more than five minutes old; ignoring it.');
   }
   return [{ json: JSON.parse(raw) }];
   ```

3. Add a **Remove Duplicates** node set to *Remove items processed in previous executions*, comparing the field `id`, so a delivery that arrives twice is only handled once.
4. Branch on `type` with a **Switch** node (for example `proposal.submitted` → receipt email, Soirée newsletter, Pipedrive).

Use **Send test event** on the endpoint's page to try the workflow with a `test.ping`. Both the Webhook and Code nodes should show a tick in n8n. If the Code node fails:

| Message | Cause |
| --- | --- |
| `invalid syntax (<unknown>, line 1)` | The Code node's Language is Python; switch it to JavaScript |
| `Cannot find module 'crypto'` | `NODE_FUNCTION_ALLOW_BUILTIN=crypto` is not set, or n8n was not restarted |
| `Signature does not match…` | Raw Body is off, or the secret is wrong (regenerate it on the endpoint's page if lost). Expected for an unsigned test such as the curl check |
| `Webhook is more than five minutes old` | An old execution was re-run; send a fresh test event |

### Emailed links: password resets and invites

The app never sends email itself. When someone needs a link, it records an `email_link.requested` event and n8n sends the email:

- **Forgot your password?** on the sign-in page. Links last 24 hours; at most 3 per email address per hour. The page shows the same message whether or not an account exists.
- **Committee invites:** on a conference's settings page, add a reviewer's email. If they have no account, you are asked for their name, a reviewer account without a password is created, and they are emailed an invite to set one (valid for 7 days).
- **Guest confirmations** (`confirm_proposal`): sent after a guest submission; valid for 6 months. `data.proposals` lists what to confirm (`title` and `conference`). Any of a guest's confirmation links confirms everything they have waiting.
- **Claiming a guest account** (`claim_account`): sent instead of a password reset when a guest uses **Forgot your password?** or registers with their email; valid for 7 days.

Every link works once, and a newer link for the same person and purpose cancels older ones. Opening a link only shows a form; nothing happens until the person saves a password, so email scanners that open links cannot use them up. Setting a password signs the person in and signs them out everywhere else.

`data` in the event looks like this:

```json
{
  "purpose": "password_reset",
  "url": "https://dev-cfp.platformable.com/link/…",
  "expires_at": "2027-01-15T10:30:00Z",
  "recipient": { "id": 42, "name": "Ada Lovelace", "first_name": "Ada", "email": "ada@example.com" },
  "conference": null,
  "proposals": null
}
```

For `committee_invite`, `conference` is `{ "name": "…", "slug": "…" }`. For `confirm_proposal`, `proposals` is a list such as `[{ "title": "…", "conference": "FOST GreenIO Summit" }]`; otherwise it is `null`.

**In n8n:** tick `email_link.requested` on your endpoint (Organise → Integrations → the endpoint → Settings). Then, after the Remove Duplicates node:

1. In the **Switch** on `type` (Mode: Rules), set one rule to `{{ $json.type }}` *is equal to* `email_link.requested` (optionally rename the output `Emails`).
2. On that output, add a **Code** node (Mode: *Run Once for All Items*, Language: **JavaScript**) called `Write email`, and paste this. It writes the right subject and text for each purpose, so no second Switch is needed:

   ```js
   // Writes the email for each email_link.requested event: who it goes to, the subject and the text.

   // While testing, list your own addresses here (in lowercase) so nobody else gets emails,
   // e.g. ['you@example.com', 'you+guest1@example.com']. An empty list sends to everyone.
   const TEST_ONLY = [];

   const emails = [];
   for (const item of $input.all()) {
     const d = item.json.data;
     if (TEST_ONLY.length > 0 && !TEST_ONLY.includes(d.recipient.email.toLowerCase())) continue;
     const name = d.recipient.first_name || d.recipient.name;
     const expires = DateTime.fromISO(d.expires_at).setZone('Europe/London').toFormat("d MMMM yyyy 'at' HH:mm");
     let subject;
     let lines;
     if (d.purpose === 'password_reset') {
       subject = 'Reset your FOST Call for Speakers password';
       lines = ['Use this link to choose a new password:', d.url];
     } else if (d.purpose === 'committee_invite') {
       subject = `You're invited to review proposals for ${d.conference ? d.conference.name : 'FOST'}`;
       lines = [`You have been added to the program committee${d.conference ? ` for ${d.conference.name}` : ''}.`,
         'Use this link to set your password and start reviewing:', d.url];
     } else if (d.purpose === 'confirm_proposal') {
       subject = 'Please confirm your proposal for FOST';
       lines = ['Thank you for your proposal. It only counts once you confirm it:',
         ...(d.proposals || []).map((p) => `- ${p.title} (${p.conference})`), '', 'Confirm here:', d.url];
     } else if (d.purpose === 'claim_account') {
       subject = 'Set a password for your FOST Call for Speakers account';
       lines = ['Use this link to set a password, so you can sign in and edit your proposals:', d.url];
     } else {
       continue; // a kind of link this workflow doesn't know yet
     }
     const text = [`Hello ${name},`, '', ...lines, '',
       `The link works once and expires on ${expires} (UK time).`,
       "If you didn't ask for this, you can ignore this email.", '', 'FOST Call for Speakers'].join('\n');
     emails.push({ json: { to: d.recipient.email, subject, text } });
   }
   return emails;
   ```

3. After it, add a **Send Email** node (or Gmail or Outlook) with **To** `{{ $json.to }}`, **Subject** `{{ $json.subject }}`, **Email Format** *Text* and **Text** `{{ $json.text }}`. Choose the sending account in its credential and set **From Email**. Turn off *Append n8n Attribution* if offered.
4. Save and publish (or activate) the workflow, then test with **Forgot your password?** on your own email.

To move to a different sending address later, change only the email node's credential and From address.

If an email does not arrive, an organiser can open **Organise → People** and press **Copy password link** (or **Copy confirmation link** for a guest with proposals waiting) next to the person. The link is shown once and no email is sent; send it to them yourself.

### Reading data with an API key

Create a key under Organise → Integrations and send it as `Authorization: Bearer <key>` (in n8n: an HTTP Request node with *Header Auth*). Read-only keys can only use `GET`. Each key may make 600 requests a minute.

| Request | Returns |
| --- | --- |
| `GET /api/v1/conferences` | Every conference |
| `GET /api/v1/conferences/{id or slug}` | One conference |
| `GET /api/v1/conferences/{id or slug}/committee` | Program committee names and emails |
| `GET /api/v1/proposals?conference=&status=&updated_since=` | Proposals, oldest change first; `status` is what the speaker sees (`under review`, `accepted`, `waitlisted`, `rejected`, `withdrawn`) |
| `GET /api/v1/proposals/{id}` | One proposal, same shape as in events |
| `GET /api/v1/speakers/{id}` | One speaker profile, same shape as in events |

Lists return `{ "items": [...], "next_cursor": "..." }` with up to 100 items (`?limit=` for fewer); pass `?cursor=<next_cursor>` for the next page until it is `null`. Errors look like `{ "error": { "code": "not_found", "message": "..." } }` with a matching HTTP status (401 no or bad key, 403 read-only key, 404, 405, 429 with `Retry-After`). API keys do not open the spreadsheet export links, and the export token does not work as an API key.

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
  payloads.ts         speaker, proposal and conference objects for events and /api/v1/
  events.ts           recording events with each change (outbox)
  webhooks.ts         endpoints, signing, delivery, retries, delivery log
  worker.ts           the delivery loop run by npm run worker
  api-keys.ts, api.ts, api-v1.ts   API keys, rate limit, /api/v1/ handlers
  session.ts          Next.js glue: current user, guards, flash messages
src/actions/          Server actions (every change goes through these, with role checks)
src/app/              Pages and routes (App Router)
src/components/       Shared UI, including the multi-conference proposal form
scripts/              db:migrate, db:seed and worker
test/                 Integration tests
```

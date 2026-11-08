# Production setup checklist (cfp.joinfost.io)

The permanent site for FOST Call for Speakers. Real speaker data goes **only** here. dev-cfp.platformable.com stays the test site and only ever holds fake data.

Work through the sections in order. Steps marked **(Mark)** need Mark; the rest are for whoever runs the servers (Alexei).

## 1. Server and database

- [ ] **Hosting:** a server on OVHcloud or Scaleway, the same kind of setup as dev-cfp: Docker or a VM with Node.js 20.9+ (22.12+ if OpenSpec will be run there).
- [ ] **A new PostgreSQL 14+ database just for production.** Don't reuse dev's.
  - [ ] A database user that only has access to this database.
  - [ ] Not reachable from the internet (private network or firewall).
  - [ ] **Daily backups**, kept for at least 30 days, and **one test restore** done before real data goes in.
- [ ] **Server basics:** SSH keys only (no password login), automatic security updates, firewall allowing only 80/443 (and SSH from known addresses).

## 2. Domain and HTTPS

- [ ] DNS: `cfp.joinfost.io` points to the server.
- [ ] HTTPS certificate (for example Let's Encrypt through Caddy, Traefik or Nginx). Plain `http://` should redirect to `https://`.

## 3. App and worker

- [ ] Build from the latest `main` (see the README's Production section).
- [ ] Environment variables for **both** processes:

  | Variable | Value |
  |---|---|
  | `DATABASE_URL` | The production database |
  | `BASE_URL` | `https://cfp.joinfost.io` |
  | `NODE_ENV` | `production` |
  | `PORT` | Whatever the proxy forwards to (for example 3000) |
  | `ALLOW_INSECURE_COOKIES` | **Not set** |
  | `ALLOW_PRIVATE_WEBHOOKS` | Not set, unless n8n is on the same private network |

- [ ] **Web process** running and restarting automatically. The database tables are created when it first starts.
- [ ] **Worker process** (`npm run worker`) running next to it with the same environment, restarting automatically. It needs the full repository and `node_modules`, not just the standalone build (README: "The webhook worker").
- [ ] **Do not run `npm run db:seed` on production.** It creates demo accounts with a known password.

## 4. First sign-in (straight after the first start)

- [ ] **(Mark)** Open `https://cfp.joinfost.io/register` and create your account **before sharing the address with anyone**. The first account on a new database becomes the organiser (admin).
- [ ] **(Mark)** Add the other organisers: they register, then you make them admins under Organise → People.

## 5. Conferences

- [ ] **(Mark)** Create each 2027 conference (Organise → New conference):
  - dates (month only is fine), call opening and closing dates;
  - topics, using the same names as the Typeform topic choices (OpenAPI, JSON Schema, GraphQL, AsyncAPI, GreenIO, …) where they apply;
  - session formats left blank to use the defaults.
- [ ] **(Mark)** Add committee members if known (they get an invite email once n8n's email branch is set up for production).

## 6. n8n for production

Production gets its **own** endpoint, signing secret and API key. Don't point production at dev's n8n workflow, or the other way round.

- [ ] **(Mark)** In n8n, duplicate the dev workflow for production (Webhook → Code → Remove Duplicates → Switch → Write email → Send email). Keep `TEST_ONLY` filled in until the cutover.
- [ ] **(Mark)** On production, Organise → Integrations → Add endpoint with the production workflow's Production URL. Tick the events you want, including `email_link.requested` and, once built, `proposal.imported`. Paste the new signing secret into the production Code node.
- [ ] **(Mark)** Press **Send test event**: it should show *Delivered*, and n8n should show a green run.
- [ ] **(Mark)** Create a **read-write API key** named "n8n Typeform sync" (needed for the Typeform import's live sync).

## 7. Checks before real data

- [ ] Organise → Integrations says "Delivery worker last checked in just now".
- [ ] "Forgot your password?" on your own email sends you the email (through `TEST_ONLY`).
- [ ] The sign-in page shows "Forgot your password?", and the proposal form shows "About you" when signed out.
- [ ] Spreadsheet exports download, and their links use `https://cfp.joinfost.io`.

## 8. Real data (when `import-existing-proposals` is built)

- [ ] **(Mark)** Organise → Import: upload the Typeform export, map each conference column (2027 conferences; Paris 2026 → Skip), check the preview, import.
- [ ] **(Mark)** Resolve the topic exceptions list.
- [ ] **(Mark)** Mark the early (visa) approvals as accepted, ticking "told before this app was used".
- [ ] **(Mark)** Turn on the n8n Typeform → production API workflow, using the read-write key.

## 9. Afterwards

- [ ] An uptime check on `https://cfp.joinfost.io` (any monitoring service), alerting Mark and Alexei.
- [ ] Someone looks at the worker check-in on the Integrations page weekly until the cutover.
- [ ] **dev-cfp:** confirm it holds no real speaker data. From now on, test changes there first, then deploy to production.

At the mid-December cutover, see the roadmap: claim-your-account emails, Typeform off, CFP links point to `https://cfp.joinfost.io`, and `TEST_ONLY = []` in n8n.

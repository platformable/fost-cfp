# Tasks

## 1. Schema

- [ ] 1.1 Add `db/migrations/003_integration_events.sql` with `events`, `webhook_endpoints`, `webhook_deliveries` and `api_keys` (indexes on delivery due time and status, event type, key hash) and verify `npm run db:migrate` applies it to a copy of the seeded database and the existing tests still pass

## 2. Shared payloads

- [ ] 2.1 Add `src/lib/payloads.ts` building the speaker, proposal and conference objects (speaker-visible status via `publicStatus()`, country name and code, headshot source, `date_precision` of `day` or `null`) and verify integration tests check every field listed in the "Payloads are self-contained" requirement
- [ ] 2.2 Verify with an integration test that a proposal accepted but not yet visible to its speaker produces a payload with status "under review" and no internal notes, reviews or scores

## 3. Recording events

- [ ] 3.1 Add `src/lib/events.ts` with `recordEvent(client, type, data)` that writes the event and one delivery row per subscribed endpoint (including paused ones) and sends a `NOTIFY`; verify with a test that an event recorded inside a rolled-back transaction leaves no event or delivery rows
- [ ] 3.2 Move registration and profile saves into `transaction()` and record `speaker.registered` and `speaker.profile_updated` (with the list of changed fields; nothing when nothing changed); verify with integration tests
- [ ] 3.3 Record `proposal.submitted` (one per conference), `proposal.updated` (only when something changed), `proposal.withdrawn`, `proposal.speaker_confirmed` and `proposal.speaker_declined` in the existing proposal functions; verify with integration tests, including a two-conference submission producing two events

## 4. Delivery worker

- [ ] 4.1 Add `src/lib/webhooks.ts`: sign deliveries (`X-FOST-Event-Id`, `X-FOST-Event-Type`, `X-FOST-Timestamp`, `X-FOST-Signature`), send with a 10-second timeout and no redirects, and apply the retry schedule from design.md; verify with tests against a local test HTTP server that the signature verifies and that a failing then recovering endpoint is delivered on retry
- [ ] 4.2 Add the SSRF guard refusing private, loopback and link-local addresses in production (allowing `localhost` in development) and verify with unit tests
- [ ] 4.3 Add `scripts/worker.ts` and `npm run worker`: claim due deliveries with `FOR UPDATE SKIP LOCKED`, wake on `LISTEN/NOTIFY` with a polling fallback, skip paused endpoints, record a heartbeat, and run the daily 30-day payload purge; verify two workers running together deliver each pending delivery once in a test
- [ ] 4.4 Add a `worker` service to `docker-compose.yml` and a README section on running the worker alongside the web server on OVHcloud or Scaleway; verify `docker compose config` is valid and the README commands run as written

## 5. Organiser screens: webhooks

- [ ] 5.1 Add admin-only server actions to create, edit, pause, resume, delete endpoints and regenerate secrets (HTTPS required except `localhost`; secret shown once) and verify with integration tests, including a reviewer being refused
- [ ] 5.2 Add Organise → Integrations pages: endpoint list with health and worker last check-in, endpoint form with event checkboxes, one-time secret display, delivery log (type, time, status, attempts, last response code), "Resend" and "Send test event"; verify in the browser that a `test.ping` reaches a local test receiver and appears in the log, with copy in plain British English
- [ ] 5.3 Add a README section showing how to receive events in n8n: a Webhook node, a Code node snippet that verifies `X-FOST-Signature`, and de-duplicating by event `id`; verify the snippet against a delivery captured in task 5.2

## 6. Integration API

- [ ] 6.1 Add `src/lib/api-keys.ts` (create with name and scope, hashed storage, revoke, throttled last-used update) and admin-only actions and screens under Organise → Integrations to manage keys; verify the full key is shown once and revoked keys stop working
- [ ] 6.2 Add shared route handling for `/api/v1/`: Bearer authentication (401), `read` keys refused for non-GET methods (403), JSON error shape, 404 for unknown records, and the 600-per-minute limit with `Retry-After` (429); verify with route-level tests
- [ ] 6.3 Add `GET /api/v1/conferences`, `/conferences/{id-or-slug}`, `/conferences/{id}/committee`, `/proposals` (filters `conference`, `status`, `updated_since`; at most 100 per page with `next_cursor`) and `/proposals/{id}`, and `/speakers/{id}`, all using the shared payload builder; verify that responses match event payload shapes and that paging returns every item exactly once
- [ ] 6.4 Verify with a test that existing `/api/export/<token>/…` links and column names are unchanged, that the export token is refused by `/api/v1/` and that an API key is refused by export links

## 7. End-to-end check

- [ ] 7.1 With the web server, the worker and a local n8n (or test receiver) running, submit a proposal to two conferences, edit it, confirm a slot and update a profile; verify each expected event arrives signed, once per subscribed endpoint, with the documented payload, and that pausing then resuming an endpoint delivers the queued events

## Workflow follow-up

- Archive the change with `/opsx:archive` once it has shipped, so its specs become the project's baseline for `integrations/event-webhooks` and `integrations/integration-api`.

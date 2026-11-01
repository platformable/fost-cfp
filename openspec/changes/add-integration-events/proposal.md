# Proposal

## Why

Speaker submissions and decisions need to set off work in other tools straight away: confirmation emails, the Soirée newsletter, the consent form (moving from Typeform to Formbricks), Mark's Pipedrive, the event overview spreadsheet and committee notifications. That work will run in n8n. Today the app can only be polled through spreadsheet exports, so nothing happens when something changes, and there is no way for n8n to send results back. Every later change in the roadmap (emailed links, guest submissions, staged decisions, the speaker record, speaker assets) depends on this two-way connection, so it comes first.

## What Changes

- The app records an **event** for each meaningful change, in the same database transaction as the change, so an event is never lost and never sent for a change that didn't happen. Initial events cover what exists today: speaker registered, speaker profile updated, proposal submitted, proposal updated, proposal withdrawn, and speaker confirmed or declined their slot. Later changes add their own events (for example, speakers informed of a decision).
- Organisers can register one or more **webhook endpoints** (for example, an n8n Webhook node URL), choose which events each receives, and see a delivery log. Each delivery is signed with a secret shown once, so n8n can check that it came from the app. Failed deliveries are retried automatically with increasing delays and can be resent by hand.
- Event payloads carry enough data for n8n to act without calling back: the speaker's profile (name, email, job title, organisation, bio, LinkedIn URL, country, headshot), the proposal, and the conference, including whether the conference date is exact or known only to the month.
- Organisers can create named, revocable **API keys** for n8n. With a key, n8n can read speakers, proposals, conferences and each conference's committee. This change sets up keys, authentication, error format and rate limiting for the API; the first write endpoints (such as recording that a consent form was signed in Formbricks) arrive with the changes that need them.
- A new **Organise → Integrations** page holds webhook endpoints, delivery log, a "Send test event" button and API keys.
- Webhook delivery runs as a separate background worker process alongside the web server, which suits hosting on OVHcloud or Scaleway.
- The existing spreadsheet export links (`/api/export/<token>/…`) and all export column names are **unchanged**.

## Capabilities

### New Capabilities

- `integrations/event-webhooks`: the catalogue of events the app emits, what each payload contains, how events are recorded, and how they are delivered, signed, retried and managed by organisers.
- `integrations/integration-api`: API keys for automations, how requests are authenticated and rate limited, the read endpoints for speakers, proposals, conferences and committees, and the conventions later write endpoints follow.

### Modified Capabilities

None. No specs exist yet for the current behaviour, and existing behaviour (including spreadsheet exports) does not change.

## Impact

- **Database:** new migration adding tables for events, webhook endpoints, deliveries and API keys.
- **Code:** event recording added to the existing actions that register users, save profiles, submit, edit and withdraw proposals, and confirm or decline slots (`src/lib/users.ts`, `src/lib/proposals.ts`); new `src/lib/events.ts`, `src/lib/webhooks.ts` and `src/lib/api-keys.ts`; new API routes under `src/app/api/v1/`; new Integrations pages under `src/app/admin/integrations/`.
- **Operations:** a second process (`npm run worker`) must run next to the web server to deliver webhooks. Webhook URLs must use HTTPS, except `localhost` during development.
- **Privacy:** payloads contain personal data (names, emails, bios). They are only sent to endpoints an organiser has registered, over HTTPS, and signed. The delivery log keeps payloads for a limited time.
- **Dependencies:** none new expected; signing uses Node's built-in crypto.

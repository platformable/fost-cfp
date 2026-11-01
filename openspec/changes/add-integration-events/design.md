# Design

## Context

See proposal.md for why. The app is Next.js 15 with server actions over PostgreSQL (`pg`, plain SQL migrations applied at start-up). Business rules live in `src/lib`, independent of Next.js. Today some writes run inside `transaction()` (proposal submission, edits, decisions) and some do not (registration, profile saves). The app will run as a long-lived server on OVHcloud or Scaleway, not on a serverless platform. n8n is the only planned consumer at first, but organisers may register more than one endpoint (for example, production and test n8n workflows).

## Goals / Non-Goals

**Goals:**
- No lost or phantom events: an event exists if and only if its change was saved.
- One payload shape shared by webhooks and API reads.
- Safe to run more than one worker or web instance later without double sending beyond the at-least-once contract.

**Non-Goals:**
- Write endpoints. Only their conventions are set here; consent, attendance and other writes arrive with their own changes.
- Events for decisions. The "speakers informed" events arrive with the staged-decisions change; today's internal decision recording emits nothing.
- Exactly-once delivery or guaranteed ordering.
- Replaying history to endpoints added later. A new endpoint receives events recorded after it was created.

## Decisions

### 1. Transactional outbox in PostgreSQL
Events are inserted into an `events` table inside the same transaction as the change. Delivery rows (`webhook_deliveries`, one per event and subscribed endpoint) are created in that same transaction.
- *Why:* guarantees the "recorded with the change" requirement without a message broker.
- *Alternative:* sending the HTTP request straight from the server action. Rejected: a slow or failing n8n would slow or fail the speaker's submission, and a crash between saving and sending would lose the event.
- Registration and profile saves move inside `transaction()` so they can record events atomically. Library functions that record events take the transaction client.

### 2. Delivery rows created at record time, including for paused endpoints
Creating deliveries up front, even for paused endpoints, means pausing an endpoint queues its events instead of dropping them, as the spec requires. The worker skips deliveries whose endpoint is paused. Deleting an endpoint deletes its pending deliveries.

### 3. A separate worker process
`npm run worker` runs `scripts/worker.ts`, a loop that claims due deliveries with `SELECT … FOR UPDATE SKIP LOCKED`, sends them, and records the outcome. It wakes on PostgreSQL `LISTEN/NOTIFY` when a new event is recorded, and otherwise polls every few seconds as a fallback.
- *Why:* the web server stays fast and stateless, several workers can run safely, and it suits a VPS or container host.
- *Alternative:* a timer inside the Next.js server via `instrumentation.ts`. Rejected: every web instance and every dev hot reload would start its own loop, and work would stop whenever the web server restarts.
- `docker-compose.yml` gains a `worker` service; the README documents running both processes (for example, with systemd or two containers).

### 4. Retry schedule
Attempts happen at about 0, 1 min, 5 min, 15 min, 1 h, 3 h, 6 h, 12 h and 24 h after the first try, roughly 46 hours in total, which meets "at least 24 hours". Each attempt has a 10-second timeout and does not follow redirects. 2xx counts as success; anything else, including timeouts and 3xx, is a failure. A manual resend creates a fresh attempt for the same event without changing its `id`.

### 5. Signing and secret storage
Signature: `sha256=` + hex HMAC-SHA256 of `<unix seconds>.<raw body>`, sent with the headers named in the spec. Including the timestamp lets receivers reject old replays.
- The signing secret must be readable to sign, so it is stored in the database, not hashed. Anyone who can read the database can already read every speaker's personal data, so encrypting the secret alone adds little.
- *Alternative:* encrypting secrets with a key from an environment variable. Rejected for now because it adds a setting non-technical hosts must manage; it can be added later without changing the spec.
- n8n checks signatures with a short Code node; the README includes a ready-made snippet. Endpoints can also add a custom header, such as n8n's Header Auth, as a simpler alternative.

### 6. Protecting the server from outbound abuse (SSRF)
Webhook URLs are entered by organisers, so the server could be pointed at internal addresses (for example, a cloud metadata service). In production the worker resolves the hostname and refuses private, loopback and link-local addresses. In development, `localhost` is allowed so a local n8n can be used.

### 7. API keys
Keys look like `fost_live_<prefix>_<secret>`. Only a SHA-256 hash is stored; the prefix is stored in plain text so organisers can tell keys apart. Revocation sets `revoked_at`. Last-used time is updated at most once a minute per key, to avoid a database write on every request.

### 8. Rate limiting in memory
A fixed one-minute window per key, counted in the web process.
- *Why:* the app runs as a single web process for now, and this needs no extra infrastructure.
- *Trade-off:* with several web processes, each counts separately. If the app scales out, the counter can move to PostgreSQL without changing the spec.

### 9. One payload builder
`src/lib/payloads.ts` builds the speaker, proposal and conference objects used in event `data` and API responses. It uses `publicStatus()` for the status, so the "no organiser-only information" rule lives in one place and is tested once. Conference dates come with `date_precision: "day"`. When a conference has no dates, the dates are `null` and the precision is `null`. Month-only precision arrives with the change that adds month-only dates.

### 10. Data retention
A daily step in the worker deletes payloads from the delivery log and event bodies older than 30 days once no delivery for them is still pending. It keeps a slim row (type, time, status) so the log still shows history.

## Data model

New tables are `events`, `webhook_endpoints`, `webhook_deliveries` and `api_keys`, plus a new `worker_heartbeat` key in the existing `settings` table. Existing tables `users`, `conferences`, `proposals` and `conference_reviewers` are read but not changed. Nothing is removed. Definitions prefixed `table_` are database rows; definitions prefixed `payload_` are what n8n receives in webhooks and API responses. `payload_*` objects use `additionalProperties: false`, so a payload carrying an organiser-only field (such as `internal_notes`) fails validation.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://fost-rego/schemas/add-integration-events.json",
  "title": "add-integration-events data model",
  "description": "Database tables (prefixed table_) and external payloads (prefixed payload_) for this change. Existing tables are included where the change relies on them and are unchanged.",
  "$defs": {
    "table_events": {
      "description": "NEW: one row per recorded event, written in the same transaction as the change.",
      "type": "object",
      "properties": {
        "id": { "type": "string", "format": "uuid", "description": "NEW: primary key; also the event id sent to receivers." },
        "type": { "type": "string", "enum": ["speaker.registered", "speaker.profile_updated", "proposal.submitted", "proposal.updated", "proposal.withdrawn", "proposal.speaker_confirmed", "proposal.speaker_declined", "test.ping"], "description": "NEW" },
        "version": { "type": "integer", "minimum": 1, "description": "NEW: payload format version, starts at 1." },
        "occurred_at": { "type": "string", "format": "date-time", "description": "NEW" },
        "data": { "type": ["object", "null"], "description": "NEW: the event's data object; set to null by the 30-day purge once no delivery is pending." }
      },
      "required": ["id", "type", "version", "occurred_at", "data"],
      "additionalProperties": false
    },
    "table_webhook_endpoints": {
      "description": "NEW: endpoints organisers register.",
      "type": "object",
      "properties": {
        "id": { "type": "integer", "description": "NEW" },
        "name": { "type": "string", "minLength": 1, "description": "NEW: e.g. 'n8n production'." },
        "url": { "type": "string", "format": "uri", "description": "NEW: https only, except localhost in development." },
        "secret": { "type": "string", "description": "NEW: signing secret; shown once in the UI, never returned again." },
        "event_types": { "type": "array", "items": { "$ref": "#/$defs/table_events/properties/type" }, "minItems": 1, "uniqueItems": true, "description": "NEW" },
        "paused": { "type": "boolean", "default": false, "description": "NEW" },
        "created_by": { "type": ["integer", "null"], "description": "NEW: users.id of the organiser; null if that account is deleted." },
        "created_at": { "type": "string", "format": "date-time", "description": "NEW" },
        "updated_at": { "type": "string", "format": "date-time", "description": "NEW" }
      },
      "required": ["id", "name", "url", "secret", "event_types", "paused", "created_at", "updated_at"],
      "additionalProperties": false
    },
    "table_webhook_deliveries": {
      "description": "NEW: one row per event and subscribed endpoint, created with the event.",
      "type": "object",
      "properties": {
        "id": { "type": "integer", "description": "NEW" },
        "event_id": { "type": "string", "format": "uuid", "description": "NEW: references events.id." },
        "endpoint_id": { "type": "integer", "description": "NEW: references webhook_endpoints.id; deleting the endpoint deletes its deliveries." },
        "status": { "type": "string", "enum": ["pending", "delivered", "failed"], "description": "NEW" },
        "attempts": { "type": "integer", "minimum": 0, "description": "NEW" },
        "next_attempt_at": { "type": ["string", "null"], "format": "date-time", "description": "NEW: null once delivered or failed." },
        "last_attempt_at": { "type": ["string", "null"], "format": "date-time", "description": "NEW" },
        "last_response_status": { "type": ["integer", "null"], "description": "NEW: HTTP status, null on timeout or connection error." },
        "last_error": { "type": ["string", "null"], "description": "NEW: short reason, e.g. 'timeout'." },
        "delivered_at": { "type": ["string", "null"], "format": "date-time", "description": "NEW" },
        "created_at": { "type": "string", "format": "date-time", "description": "NEW" }
      },
      "required": ["id", "event_id", "endpoint_id", "status", "attempts", "created_at"],
      "additionalProperties": false
    },
    "table_api_keys": {
      "description": "NEW: keys for automations; only a hash of the secret is stored.",
      "type": "object",
      "properties": {
        "id": { "type": "integer", "description": "NEW" },
        "name": { "type": "string", "minLength": 1, "description": "NEW" },
        "scope": { "type": "string", "enum": ["read", "read-write"], "description": "NEW" },
        "prefix": { "type": "string", "description": "NEW: shown to tell keys apart, e.g. 'fost_live_ab12'." },
        "key_hash": { "type": "string", "description": "NEW: SHA-256 hex of the full key." },
        "created_by": { "type": ["integer", "null"], "description": "NEW: users.id of the organiser." },
        "created_at": { "type": "string", "format": "date-time", "description": "NEW" },
        "last_used_at": { "type": ["string", "null"], "format": "date-time", "description": "NEW: updated at most once a minute." },
        "revoked_at": { "type": ["string", "null"], "format": "date-time", "description": "NEW" }
      },
      "required": ["id", "name", "scope", "prefix", "key_hash", "created_at"],
      "additionalProperties": false
    },
    "table_settings_worker_heartbeat": {
      "description": "Existing settings table (unchanged structure). NEW key 'worker_heartbeat' holds the time the delivery worker last checked in.",
      "type": "object",
      "properties": {
        "key": { "const": "worker_heartbeat" },
        "value": { "type": "string", "format": "date-time" }
      },
      "required": ["key", "value"]
    },
    "table_users": {
      "description": "Existing, unchanged. Columns this change reads to build speaker payloads.",
      "type": "object",
      "properties": {
        "id": { "type": "integer" },
        "email": { "type": "string", "format": "email" },
        "first_name": { "type": "string" },
        "last_name": { "type": "string" },
        "name": { "type": "string", "description": "Generated: first_name + last_name." },
        "role": { "type": "string", "enum": ["speaker", "reviewer", "admin"] },
        "organization": { "type": "string" },
        "job_title": { "type": "string" },
        "bio": { "type": "string" },
        "linkedin_profile_url": { "type": "string" },
        "country": { "type": "string", "description": "ISO 3166-1 alpha-2 code or ''." },
        "photo_url": { "type": "string" }
      }
    },
    "table_conferences": {
      "description": "Existing, unchanged. Columns this change reads to build conference payloads.",
      "type": "object",
      "properties": {
        "id": { "type": "integer" },
        "name": { "type": "string" },
        "slug": { "type": "string" },
        "location": { "type": "string" },
        "website": { "type": "string" },
        "start_date": { "type": ["string", "null"], "format": "date" },
        "end_date": { "type": ["string", "null"], "format": "date" },
        "cfp_opens": { "type": ["string", "null"], "format": "date" },
        "cfp_closes": { "type": ["string", "null"], "format": "date" },
        "decisions_published": { "type": "boolean" }
      }
    },
    "table_proposals": {
      "description": "Existing, unchanged. Columns this change reads to build proposal payloads; internal_notes, feedback_to_speaker of unpublished decisions and reviews are never sent.",
      "type": "object",
      "properties": {
        "id": { "type": "integer" },
        "conference_id": { "type": "integer" },
        "speaker_id": { "type": "integer" },
        "title": { "type": "string" },
        "abstract": { "type": "string" },
        "format": { "type": "string" },
        "topic": { "type": "string" },
        "level": { "type": "string" },
        "co_speakers": { "type": "string" },
        "status": { "type": "string", "enum": ["submitted", "accepted", "waitlisted", "rejected", "withdrawn"] },
        "speaker_confirmation": { "type": "string", "enum": ["", "confirmed", "declined"] },
        "version": { "type": "integer" },
        "submitted_at": { "type": "string", "format": "date-time" },
        "updated_at": { "type": "string", "format": "date-time" },
        "confirmed_at": { "type": ["string", "null"], "format": "date-time" }
      }
    },
    "table_conference_reviewers": {
      "description": "Existing, unchanged. Read to answer /api/v1/conferences/{id}/committee.",
      "type": "object",
      "properties": { "conference_id": { "type": "integer" }, "user_id": { "type": "integer" } }
    },
    "payload_speaker": {
      "description": "NEW: speaker object in events and API responses.",
      "type": "object",
      "properties": {
        "id": { "type": "integer" },
        "name": { "type": "string" },
        "first_name": { "type": "string" },
        "last_name": { "type": "string" },
        "email": { "type": "string", "format": "email" },
        "job_title": { "type": "string" },
        "organization": { "type": "string" },
        "bio": { "type": "string" },
        "linkedin_profile_url": { "type": ["string", "null"], "format": "uri" },
        "country": { "type": ["string", "null"], "description": "Country name, e.g. 'United Kingdom'." },
        "country_code": { "type": ["string", "null"], "pattern": "^[A-Z]{2}$" },
        "photo_url": { "type": ["string", "null"], "format": "uri" },
        "headshot_source": { "type": "string", "enum": ["photo_url", "linkedin", "missing"] }
      },
      "required": ["id", "name", "first_name", "last_name", "email", "job_title", "organization", "bio", "linkedin_profile_url", "country", "country_code", "photo_url", "headshot_source"],
      "additionalProperties": false
    },
    "payload_conference": {
      "description": "NEW: conference object in events and API responses.",
      "type": "object",
      "properties": {
        "id": { "type": "integer" },
        "name": { "type": "string" },
        "slug": { "type": "string" },
        "location": { "type": "string" },
        "start_date": { "type": ["string", "null"], "format": "date" },
        "end_date": { "type": ["string", "null"], "format": "date" },
        "date_precision": { "type": ["string", "null"], "enum": ["day", "month", null], "description": "'month' arrives with the month-only dates change; null when no dates are set." },
        "cfp_opens": { "type": ["string", "null"], "format": "date" },
        "cfp_closes": { "type": ["string", "null"], "format": "date" },
        "url": { "type": "string", "format": "uri", "description": "Public call-for-proposals page." }
      },
      "required": ["id", "name", "slug", "location", "start_date", "end_date", "date_precision", "cfp_opens", "cfp_closes", "url"],
      "additionalProperties": false
    },
    "payload_proposal": {
      "description": "NEW: proposal object in events and API responses. status is what the speaker sees.",
      "type": "object",
      "properties": {
        "id": { "type": "integer" },
        "title": { "type": "string" },
        "abstract": { "type": "string" },
        "format": { "type": "string" },
        "topic": { "type": "string" },
        "level": { "type": "string" },
        "co_speakers": { "type": "string" },
        "status": { "type": "string", "enum": ["under review", "accepted", "waitlisted", "rejected", "withdrawn"] },
        "speaker_confirmation": { "type": ["string", "null"], "enum": ["confirmed", "declined", null] },
        "version": { "type": "integer", "minimum": 1 },
        "submitted_at": { "type": "string", "format": "date-time" },
        "updated_at": { "type": "string", "format": "date-time" },
        "proposal_url": { "type": "string", "format": "uri" },
        "review_url": { "type": "string", "format": "uri" },
        "speaker": { "$ref": "#/$defs/payload_speaker" },
        "conference": { "$ref": "#/$defs/payload_conference" }
      },
      "required": ["id", "title", "abstract", "format", "topic", "level", "co_speakers", "status", "speaker_confirmation", "version", "submitted_at", "updated_at", "proposal_url", "review_url", "speaker", "conference"],
      "additionalProperties": false
    },
    "payload_event": {
      "description": "NEW: body of every webhook delivery.",
      "type": "object",
      "properties": {
        "id": { "type": "string", "format": "uuid" },
        "type": { "$ref": "#/$defs/table_events/properties/type" },
        "version": { "const": 1 },
        "occurred_at": { "type": "string", "format": "date-time" },
        "data": {
          "oneOf": [
            { "type": "object", "description": "proposal.* events", "properties": { "proposal": { "$ref": "#/$defs/payload_proposal" }, "changed_fields": { "type": "array", "items": { "type": "string" }, "description": "proposal.updated only" } }, "required": ["proposal"], "additionalProperties": false },
            { "type": "object", "description": "speaker.* events", "properties": { "speaker": { "$ref": "#/$defs/payload_speaker" }, "changed_fields": { "type": "array", "items": { "type": "string" }, "description": "speaker.profile_updated only" } }, "required": ["speaker"], "additionalProperties": false },
            { "type": "object", "description": "test.ping", "properties": { "message": { "type": "string" } }, "required": ["message"], "additionalProperties": false }
          ]
        }
      },
      "required": ["id", "type", "version", "occurred_at", "data"],
      "additionalProperties": false
    },
    "payload_committee_member": {
      "description": "NEW: item of /api/v1/conferences/{id}/committee.",
      "type": "object",
      "properties": { "id": { "type": "integer" }, "name": { "type": "string" }, "email": { "type": "string", "format": "email" } },
      "required": ["id", "name", "email"],
      "additionalProperties": false
    },
    "payload_list_page": {
      "description": "NEW: shape of every list response.",
      "type": "object",
      "properties": {
        "items": { "type": "array" },
        "next_cursor": { "type": ["string", "null"], "description": "Pass as ?cursor= to get the next page; null on the last page." }
      },
      "required": ["items", "next_cursor"],
      "additionalProperties": false
    },
    "payload_error": {
      "description": "NEW: body of every API error response.",
      "type": "object",
      "properties": {
        "error": {
          "type": "object",
          "properties": {
            "code": { "type": "string", "enum": ["unauthorized", "forbidden", "not_found", "rate_limited", "invalid_request"] },
            "message": { "type": "string" }
          },
          "required": ["code", "message"],
          "additionalProperties": false
        }
      },
      "required": ["error"],
      "additionalProperties": false
    }
  }
}
```

## Risks / Trade-offs

- [The worker isn't running in production, so nothing reaches n8n] → The Integrations page shows when the worker last checked in, and warns if it is more than a few minutes ago.
- [Duplicate deliveries after a worker crash mid-send] → The at-least-once contract and the stable event `id`; the README shows how to de-duplicate in n8n.
- [Personal data sent to a mistyped or hostile URL] → Admin-only management, HTTPS required, the SSRF guard, the signing secret, and a "Send test event" button to check an endpoint before real data flows.
- [A slow endpoint holds up others] → The 10-second timeout and claiming deliveries per endpoint in parallel, a few at a time.
- [Event volume grows with every edit] → One small row per event and 30-day retention of bodies; edits that change nothing record nothing.

## Migration Plan

1. Migration `003_integration_events.sql` adds `events`, `webhook_endpoints`, `webhook_deliveries` and `api_keys`. It only adds tables, so it is safe to apply to a live database.
2. Deploy the web app, then start the worker. Until an organiser adds an endpoint, events are recorded with no deliveries.
3. Rollback: stop the worker and deploy the previous web version. The extra tables are ignored by older code and can be dropped later.

## Open Questions

- Fine-tuning the retry schedule once real n8n failure patterns are known. This doesn't affect the spec, which only requires at least 24 hours.

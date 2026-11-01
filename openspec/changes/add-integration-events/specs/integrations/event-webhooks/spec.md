# Spec Delta

## Purpose

Lets outside automations (such as n8n) react the moment something happens in the CFP app, by recording each meaningful change as an event and delivering it, signed, to webhook endpoints that organisers register.

## ADDED Requirements

### Requirement: Events are recorded with the change that caused them
The system SHALL record an event in the same database transaction as the change it describes. If the change is not saved, no event SHALL be recorded; if the change is saved, its event SHALL NOT be lost, even when no webhook endpoint is registered or delivery is not running at the time.

#### Scenario: Change saved, delivery not running
- **WHEN** a speaker submits a proposal while the delivery worker is stopped
- **THEN** a `proposal.submitted` event is recorded and is delivered once the worker runs again

#### Scenario: Change rejected
- **WHEN** a proposal submission fails validation
- **THEN** no event is recorded

### Requirement: Initial event catalogue
The system SHALL emit these event types: `speaker.registered`, `speaker.profile_updated`, `proposal.submitted`, `proposal.updated`, `proposal.withdrawn`, `proposal.speaker_confirmed` and `proposal.speaker_declined`. Submitting one proposal to several conferences SHALL emit one `proposal.submitted` event per conference.

#### Scenario: Multi-conference submission
- **WHEN** a speaker submits one proposal to two conferences
- **THEN** two `proposal.submitted` events are recorded, one for each conference's proposal

#### Scenario: Edit with no changes
- **WHEN** a speaker saves their proposal without changing anything
- **THEN** no `proposal.updated` event is recorded

#### Scenario: Speaker confirms their slot
- **WHEN** a speaker confirms an accepted proposal
- **THEN** a `proposal.speaker_confirmed` event is recorded

### Requirement: Event envelope
Every event SHALL be delivered as a JSON object with a unique `id`, a `type`, an `occurred_at` timestamp in UTC (ISO 8601), a payload format `version` (starting at 1) and a `data` object. The `id` SHALL stay the same across every delivery attempt of that event.

#### Scenario: Retried delivery
- **WHEN** an event is delivered a second time after a failed first attempt
- **THEN** both attempts carry the same `id`, `type` and `occurred_at`

### Requirement: Payloads are self-contained
Proposal events SHALL include the proposal (title, abstract, format, topic, level, co-speakers, speaker-visible status, links), the speaker's profile (name, first and last name, email, job title, organisation, bio, LinkedIn URL, country name and code, headshot URL and headshot source) and the conference (name, slug, location, dates). Speaker events SHALL include the speaker's profile.

#### Scenario: n8n adds a speaker to Pipedrive
- **WHEN** n8n receives `proposal.submitted`
- **THEN** the payload already contains the speaker's bio, headshot and LinkedIn URL, so no call back to the app is needed

#### Scenario: Profile changes
- **WHEN** a speaker changes their bio
- **THEN** a `speaker.profile_updated` event is recorded with the updated profile and a list of the fields that changed

### Requirement: Conference dates state their precision
Conference dates in payloads SHALL say whether they are exact days or known only to the month, so automations never treat a placeholder day as real.

#### Scenario: Exact dates
- **WHEN** a conference has exact start and end dates
- **THEN** the payload gives the dates and marks their precision as `day`

### Requirement: Payloads exclude organiser-only information
Event payloads SHALL NOT contain internal notes, committee reviews, scores or recommendations, or any decision the speaker cannot yet see. The proposal status in a payload SHALL be the status the speaker sees.

#### Scenario: Decision not yet visible
- **WHEN** a proposal has been accepted but the speaker has not been informed, and the speaker then edits it
- **THEN** the `proposal.updated` payload shows the status as under review

### Requirement: Organisers register webhook endpoints
Organisers (admins) SHALL be able to add, edit, pause and delete webhook endpoints, each with a name, a URL and the event types it receives. URLs SHALL use HTTPS, except `localhost` addresses for development. No other role SHALL see or change endpoints.

#### Scenario: Insecure URL
- **WHEN** an organiser adds an endpoint with an `http://` URL that is not `localhost`
- **THEN** the endpoint is not saved and the organiser is told the URL must start with `https://`

#### Scenario: Reviewer tries to open Integrations
- **WHEN** a reviewer opens the Integrations page
- **THEN** access is refused

#### Scenario: Paused endpoint
- **WHEN** an endpoint is paused and a matching event is recorded
- **THEN** nothing is sent to that endpoint until it is resumed, and events recorded while paused are then delivered

### Requirement: Deliveries are signed
Each endpoint SHALL have a signing secret, shown in full only once when it is created or regenerated. Every delivery SHALL carry headers `X-FOST-Event-Id`, `X-FOST-Event-Type`, `X-FOST-Timestamp` (Unix seconds) and `X-FOST-Signature`, where the signature is `sha256=` followed by the hex HMAC-SHA256 of `<timestamp>.<raw body>` keyed with the secret.

#### Scenario: Receiver verifies a delivery
- **WHEN** n8n recomputes the HMAC of `<X-FOST-Timestamp>.<body>` with the endpoint's secret
- **THEN** it matches `X-FOST-Signature`

#### Scenario: Secret regenerated
- **WHEN** an organiser regenerates an endpoint's secret
- **THEN** the new secret is shown once, and later deliveries are signed with it

### Requirement: Delivery and retries
The system SHALL deliver each event by HTTP POST. A 2xx response within 10 seconds SHALL count as delivered. Otherwise the system SHALL retry with increasing delays for at least 24 hours before marking the delivery failed. Delivery SHALL be at least once: receivers MAY get duplicates and SHOULD de-duplicate by event `id`. Order across events is not guaranteed.

#### Scenario: Endpoint temporarily down
- **WHEN** an endpoint returns an error for an hour and then recovers
- **THEN** the event is delivered on a later retry without anyone intervening

#### Scenario: Endpoint down for days
- **WHEN** every attempt fails for more than 24 hours
- **THEN** the delivery is marked failed and shown as failed in the delivery log

### Requirement: Delivery log, resend and test
Organisers SHALL see a delivery log per endpoint with each event's type, time, status, number of attempts and the last response code, and SHALL be able to resend any delivery and send a test event. Payloads in the log SHALL be deleted after 30 days.

#### Scenario: Resend a failed delivery
- **WHEN** an organiser resends a failed delivery
- **THEN** the same event, with the same `id`, is delivered again

#### Scenario: Test event
- **WHEN** an organiser presses "Send test event" for an endpoint
- **THEN** a signed `test.ping` event is delivered to that endpoint only and appears in its log

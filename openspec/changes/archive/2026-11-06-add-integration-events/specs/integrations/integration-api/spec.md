# Spec Delta

## Purpose

Gives outside automations (such as n8n) authenticated access to the CFP app's data through named, revocable API keys, and sets the rules that every current and future integration endpoint follows.

## ADDED Requirements

### Requirement: Organisers manage API keys
Organisers (admins) SHALL be able to create API keys with a name and a scope (`read` or `read-write`), see each key's name, scope, creation date and last-used time, and revoke keys. A key's full value SHALL be shown only once, when it is created. No other role SHALL see or manage keys.

#### Scenario: Create a key for n8n
- **WHEN** an organiser creates a key named "n8n production" with `read` scope
- **THEN** the full key is shown once with a prompt to copy it, and afterwards only its name, scope and the last few characters are shown

#### Scenario: Revoke a key
- **WHEN** an organiser revokes a key
- **THEN** every later request with that key is refused

### Requirement: Requests are authenticated with a key
Integration API requests SHALL send the key as `Authorization: Bearer <key>`. A missing, unknown or revoked key SHALL get a 401 response. A `read` key SHALL get a 403 response for any request that would change data. Each successful request SHALL update the key's last-used time.

#### Scenario: No key
- **WHEN** a request to `/api/v1/conferences` has no `Authorization` header
- **THEN** the response is 401 with an error explaining that an API key is required

#### Scenario: Read key attempts a change
- **WHEN** a `read` key sends a POST, PUT, PATCH or DELETE request to any `/api/v1/` path
- **THEN** the response is 403 and nothing changes

### Requirement: Versioned paths and JSON errors
The integration API SHALL live under `/api/v1/`. Every response SHALL be JSON. Errors SHALL use the shape `{"error": {"code": "...", "message": "..."}}` with a matching HTTP status, and unknown records SHALL return 404.

#### Scenario: Unknown proposal
- **WHEN** n8n requests `/api/v1/proposals/999999` and no such proposal exists
- **THEN** the response is 404 with error code `not_found`

### Requirement: Read speakers, proposals and conferences
With a valid key, the API SHALL return a speaker's profile, a proposal, a conference, and lists of proposals and conferences. These objects SHALL have the same shape as in event payloads, so n8n can treat a webhook and an API read the same way.

#### Scenario: Read a proposal
- **WHEN** n8n requests `/api/v1/proposals/{id}` for an existing proposal
- **THEN** the response contains the proposal, its speaker's profile and its conference, as in a `proposal.submitted` payload

#### Scenario: Conference by slug
- **WHEN** n8n requests `/api/v1/conferences/apidays-europe-2027`
- **THEN** the conference with that slug is returned

### Requirement: Read a conference's committee
The API SHALL return the members of a conference's program committee with their names and email addresses, so automations can notify the committee about new proposals.

#### Scenario: Notify the committee
- **WHEN** n8n receives `proposal.submitted` and requests `/api/v1/conferences/{id}/committee`
- **THEN** it gets the name and email of every committee member for that conference

### Requirement: API responses exclude organiser-only information
Until a later change explicitly adds them, API responses SHALL follow the same rule as event payloads: no internal notes, reviews, scores, recommendations or decisions the speaker cannot yet see.

#### Scenario: Accepted but not yet informed
- **WHEN** n8n reads a proposal that is accepted but whose speaker has not been informed
- **THEN** the status returned is the one the speaker sees

### Requirement: Lists are filtered and paginated
Proposal lists SHALL accept `conference`, `status` and `updated_since` filters. Lists SHALL return at most 100 items per page, with a cursor for the next page, and SHALL be ordered so that paging through them returns every item exactly once.

#### Scenario: Incremental sync
- **WHEN** n8n requests `/api/v1/proposals?updated_since=2027-01-01T00:00:00Z`
- **THEN** only proposals changed since that time are returned, newest changes last, with a `next_cursor` when more remain

### Requirement: Rate limits
Each key SHALL be limited to 600 requests per minute. Requests over the limit SHALL get a 429 response with a `Retry-After` header.

#### Scenario: Too many requests
- **WHEN** a key sends its 601st request within one minute
- **THEN** the response is 429 with a `Retry-After` header and nothing else happens

### Requirement: Existing export links are unchanged
The spreadsheet export links (`/api/export/<token>/...`), their token and all export column names SHALL keep working exactly as before. API keys SHALL NOT grant access to export links, and the export token SHALL NOT work as an API key.

#### Scenario: Existing Google Sheet
- **WHEN** a Google Sheet already uses `=IMPORTDATA(".../api/export/<token>/program.csv")`
- **THEN** it keeps working after this change, with the same columns

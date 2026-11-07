# Design

## Context

See proposal.md for why. Passwords are scrypt hashes in `users.password_hash` (NOT NULL); `verifyPassword()` already returns false for anything that is not a `scrypt$…` string, so an empty hash can never sign in. Sessions are database rows keyed by the SHA-256 of the cookie token (`src/lib/auth.ts`). `addReviewer()` in `src/lib/conferences.ts` refuses emails with no account. Events are recorded in the same transaction as the change through `recordEvent()` (`src/lib/events.ts`) and delivered by the worker; endpoints store an explicit `event_types` list.

## Goals / Non-Goals

**Goals:**
- One link mechanism that later changes (guest confirmation, claiming accounts, the CFP import) reuse by adding a purpose.
- No way to learn from the forgot password form whether an account exists.
- Nothing that lets someone who can read the database or the event log take over an account after a link has been used or expired.

**Non-Goals:**
- Sending email from the app (n8n does it).
- Email change, two-factor sign-in, or magic-link sign-in without a password.
- Guest confirmation and claim links (change 3 adds those purposes).

## Decisions

### 1. One `email_links` table, purpose as text with a check constraint
Columns: `id`, `user_id`, `purpose`, `token_hash` (SHA-256 hex, unique), `expires_at`, `used_at`, `created_by` (organiser for copied links, null otherwise), `created_at`. The check constraint lists `password_reset` and `committee_invite`; change 3 extends it with a new migration.
- *Alternative:* signed, stateless tokens (HMAC of user, purpose, expiry). Rejected: they cannot be made single-use or revoked when a newer link is issued without storing state anyway.

### 2. Tokens and URLs
A token is 32 random bytes, base64url. The URL is `${BASE_URL}/link/<token>`. Only `sha256(token)` is stored, like session tokens. Lookup is by hash, so comparison timing does not leak the token.
- Opening `/link/<token>` with GET only shows a page; the link is used up only when the form on it is submitted (POST). Email scanners that prefetch links cannot use them up.

### 3. Issuing a link supersedes older ones
Issuing a link marks every unused, unexpired link of the same user and purpose as used (`used_at = now()`) in the same transaction. This makes "newest link wins" true without extra columns.

### 4. Lifetimes
`password_reset`: 24 hours. `committee_invite`: 7 days. Kept as constants in `src/lib/email-links.ts`, so change 3 and the import can add their own lifetimes.

### 5. Using a link
`POST /link/<token>` with a new password, in one transaction: lock the link row (`FOR UPDATE`), check it is unused and unexpired, set the password hash, set `used_at`, delete the user's other sessions, create a new session. A committee invite and a password reset both end in "set a password"; the page wording differs by purpose.

### 6. The event
`email_link.requested` is recorded in the same transaction that issues the link, with `data = { purpose, url, expires_at, recipient: { id, name, first_name, email } }`. It is added to the event catalogue and the endpoint form's checkboxes, but existing endpoints keep their saved lists, so nobody starts receiving links without choosing to. The organiser fallback issues a link without recording the event.

### 7. Not revealing accounts
The forgot password action always returns the same message and does the same amount of visible work. It looks the account up, and when there is none, or the limit is reached, it records nothing. The per-email limit counts `email_links` rows for that user and purpose created in the last hour, so it needs no new storage. Unknown emails create nothing, so there is nothing to count.

### 8. Invites create password-less reviewer accounts
`addReviewer()` gains optional first and last names. With no matching account it creates a `users` row with `password_hash = ''`, role `reviewer`, adds the committee row and issues a `committee_invite` link, all in one transaction. It records no `speaker.registered` event (reviewers are not speakers). The committee form shows name fields, and the action asks for them when the email is unknown.

## Risks / Trade-offs

- [The link sits in the event payload, which is stored for up to 30 days and visible in n8n's execution log] → Links expire in 24 hours or 7 days and are single-use, so a stored payload is useless once used or expired. Event bodies are already purged after 30 days.
- [No n8n workflow yet, so no email arrives] → The organiser "Copy password link" fallback. The forgot password page also says to contact the organisers if nothing arrives.
- [Someone floods a speaker with reset emails] → 3 per email per hour.
- [Email scanners pre-open links] → GET never uses a link up (decision 2).

## Migration Plan

1. `005_email_links.sql` only adds a table and indexes; safe on the live database.
2. Deploy the web app and keep the worker running. Then, in n8n, tick `email_link.requested` on the endpoint and add the email branch from the README.
3. Rollback: deploy the previous version. Unused links simply stop being reachable; the table can be dropped later.

## Data model

Definitions prefixed `table_` are database rows; `payload_` are what n8n receives. Existing definitions this change relies on (`payload_event`, `table_users`) are repeated only for the parts it touches. Nothing is removed.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://dev-cfp.platformable.com/schema/add-email-links.json",
  "title": "add-email-links data model",
  "$defs": {
    "table_email_links": {
      "description": "NEW: one row per issued link.",
      "type": "object",
      "properties": {
        "id": { "type": "integer", "description": "NEW" },
        "user_id": { "type": "integer", "description": "NEW: references users.id; deleting the user deletes their links." },
        "purpose": { "type": "string", "enum": ["password_reset", "committee_invite"], "description": "NEW: later changes add purposes with their own migration." },
        "token_hash": { "type": "string", "pattern": "^[0-9a-f]{64}$", "description": "NEW: SHA-256 hex of the token in the link; unique." },
        "expires_at": { "type": "string", "format": "date-time", "description": "NEW" },
        "used_at": { "type": ["string", "null"], "format": "date-time", "description": "NEW: set when the link is used or superseded by a newer link." },
        "created_by": { "type": ["integer", "null"], "description": "NEW: organiser who copied the link from the People page; null for links sent by email." },
        "created_at": { "type": "string", "format": "date-time", "description": "NEW" }
      },
      "required": ["id", "user_id", "purpose", "token_hash", "expires_at", "used_at", "created_by", "created_at"],
      "additionalProperties": false
    },
    "table_users": {
      "description": "Existing table; no columns change.",
      "type": "object",
      "properties": {
        "password_hash": { "type": "string", "description": "CHANGED: may now be '' for an account whose owner has not set a password (invited reviewers). Such accounts cannot sign in with a password." },
        "role": { "type": "string", "enum": ["speaker", "reviewer", "admin"] }
      }
    },
    "payload_email_link_requested": {
      "description": "NEW: data of an email_link.requested event.",
      "type": "object",
      "properties": {
        "purpose": { "type": "string", "enum": ["password_reset", "committee_invite"] },
        "url": { "type": "string", "format": "uri", "description": "The link to put in the email, e.g. https://dev-cfp.platformable.com/link/<token>." },
        "expires_at": { "type": "string", "format": "date-time" },
        "recipient": {
          "type": "object",
          "properties": {
            "id": { "type": "integer" },
            "name": { "type": "string" },
            "first_name": { "type": "string" },
            "email": { "type": "string", "format": "email" }
          },
          "required": ["id", "name", "first_name", "email"],
          "additionalProperties": false
        },
        "conference": {
          "type": ["object", "null"],
          "description": "For committee_invite: the conference the person was invited to review (name and slug); null otherwise.",
          "properties": { "name": { "type": "string" }, "slug": { "type": "string" } },
          "required": ["name", "slug"],
          "additionalProperties": false
        }
      },
      "required": ["purpose", "url", "expires_at", "recipient", "conference"],
      "additionalProperties": false
    },
    "payload_event": {
      "description": "Existing envelope. CHANGED: type gains 'email_link.requested', whose data is payload_email_link_requested.",
      "type": "object",
      "properties": {
        "type": { "type": "string", "enum": ["speaker.registered", "speaker.profile_updated", "proposal.submitted", "proposal.updated", "proposal.withdrawn", "proposal.speaker_confirmed", "proposal.speaker_declined", "email_link.requested", "test.ping"] }
      }
    }
  }
}
```

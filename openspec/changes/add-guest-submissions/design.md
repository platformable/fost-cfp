# Design

## Context

See proposal.md for why. This change assumes `add-email-links` is in place:
- the `email_links` table and `/link/[token]` page;
- password-less accounts (`password_hash = ''`) that cannot sign in;
- the `email_link.requested` event.

Proposals are created by `submitProposals()` inside one transaction, which records `proposal.submitted` per conference. Many queries read `proposals` directly:
- `reviewList`, `statusCounts`, `neighbours` and `speakerProposals` in `src/lib/proposals.ts`;
- `conferenceStats` in `src/lib/conferences.ts`;
- every dataset in `src/lib/export.ts`;
- `listProposalPayloads` and `proposalPayloadById` in `src/lib/payloads.ts`.

## Goals / Non-Goals

**Goals:**
- An unconfirmed proposal is invisible everywhere except a count for organisers, and sets off nothing.
- Guests and imported speakers (December) share one model: a speaker account with no password.
- No way to find out from the guest form, registration or forgot password whether an account exists.

**Non-Goals:**
- Letting guests edit or withdraw without claiming an account.
- The CFP import itself (change 3b), and consent forms (change 6).
- A third-party captcha.

## Decisions

### 1. A flag on proposals, not a separate table
`proposals.awaiting_confirmation BOOLEAN NOT NULL DEFAULT false`. Guest submissions insert with `true`; confirming sets it to `false`.
- *Why:* the proposal already has every field it needs. Confirming is a single update, and the December import inserts with `false`.
- *Alternative:* a `pending_submissions` table copied into `proposals` on confirmation. Rejected: it duplicates the proposal shape and the multi-conference logic.
- **Every read path filters `NOT awaiting_confirmation`**, except the organiser count and the confirmation page. To stop new queries forgetting, the filter goes into a shared SQL fragment and a test asserts that each export, list and API route leaves out an unconfirmed proposal.

### 2. Guest accounts are ordinary speaker rows with no password
A guest submission finds the account by email or creates one: `role = 'speaker'`, `password_hash = ''`, with the given name and organisation. An existing account is used as it is; its name and organisation are not overwritten by what a guest typed.
- `account_status` in payloads is `guest` when `password_hash = ''`, otherwise `active`.
- The `speakers` export gains an `account_status` column, added after all existing columns.

### 3. Confirmation links
- Purpose `confirm_proposal`, lifetime 6 months, tied to the user.
- Using one confirms **all** of that user's proposals awaiting confirmation, so an older link from a second submission still works after a newer one supersedes it.
- On confirmation, in one transaction:
  - set `awaiting_confirmation = false`;
  - record `proposal.submitted` for each proposal confirmed;
  - record `speaker.registered` if the user has no other confirmed proposals and no password.

  `submitted_at` keeps the original time.
- The `email_link.requested` payload for this purpose also lists the proposals' titles and conference names, so the email can say what is being confirmed.
- GET `/link/<token>` shows what will be confirmed and a "Confirm" button; POST confirms. A scanner that pre-opens the link therefore does not confirm. The confirmation result page offers "Set a password" (optional), which uses the same transaction and signs the guest in.

### 4. Claim links
- Purpose `claim_account`, lifetime 7 days.
- The forgot password form issues `claim_account` instead of `password_reset` when the account has no password and is a speaker, so the email wording fits.
- Registering with a guest's email issues a `claim_account` link and shows "Check your email" rather than creating an account or saying it exists. Registering with an email that has a password keeps today's message: the registration form already reveals that, and changing it is out of scope.

### 5. Anti-bot check
- A hidden `website` field (a honeypot).
- A signed timestamp field set when the form renders: an HMAC of the time with a server secret from `settings`, so it can't be forged. Submissions under 3 seconds old are refused.
- At most 5 proposals awaiting confirmation per email address.

The honeypot and timing refusals show the normal success message and save nothing, so bots learn nothing. The per-email limit shows a real message, because a real person needs to know to confirm first.

### 6. Expiry in the worker's daily step
The worker's daily step already purges old event bodies. It also:
- deletes proposals with `awaiting_confirmation` older than 6 months;
- then deletes speaker accounts with no password, no proposals, no committee rows and no unexpired links.

The unexpired-links condition keeps someone who has just been sent a claim link.

### 7. The form for signed-out visitors
`/proposals/new` no longer requires sign-in. Signed-out visitors see an "About you" block (first name, last name, email, organisation) above the proposal fields, with a link to sign in instead. `submitProposalAction` takes the guest path when there is no session. The success page says "Check your email to confirm your proposal", whatever the outcome of the account lookup.

## Risks / Trade-offs

- **[A query forgets the filter and leaks an unconfirmed proposal to the committee or an export]** → Mitigations:
  - the shared fragment;
  - a test that creates an unconfirmed proposal and checks every export dataset, the committee list, counts, payload lists and each `/api/v1/` list;
  - a code-review checklist line in tasks.
- **[Someone submits under another person's email]** → It never counts unless that person confirms, and they can ignore it. It expires in 6 months, and the 5-per-email limit caps the noise.
- **[A guest typos their email]** → The proposal never confirms and expires. The success page shows the email they typed so they can notice and resubmit.
- **[The confirmation email does not arrive because the n8n branch is missing]** → Organisers see the waiting count and can copy a link from the People page. That link's purpose is chosen by account state, and this change makes the People page offer a confirmation link when the account has proposals awaiting confirmation.

## Migration Plan

1. `006_guest_submissions.sql`:
   - adds the column (default `false`, so existing proposals are unaffected);
   - replaces the `email_links` purpose check with one that includes `confirm_proposal` and `claim_account`;
   - adds a partial index on `proposals (submitted_at) WHERE awaiting_confirmation`.
2. Deploy. In n8n, add wording for the two new purposes to the `email_link.requested` branch before announcing guest submissions.
3. Rollback: the previous version ignores the column, and unconfirmed proposals would then show up. So before rolling back, delete them (`DELETE FROM proposals WHERE awaiting_confirmation`).

## Data model

Definitions prefixed `table_` are database rows; `payload_` are what n8n receives in events and API responses. Only the parts this change adds or changes are listed in full. Nothing is removed.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://dev-cfp.platformable.com/schema/add-guest-submissions.json",
  "title": "add-guest-submissions data model",
  "$defs": {
    "table_proposals": {
      "description": "Existing table (other columns unchanged).",
      "type": "object",
      "properties": {
        "awaiting_confirmation": { "type": "boolean", "default": false, "description": "NEW: true for a guest submission whose email has not been confirmed. Such proposals are left out of every list, count, export and API response, and record no events." },
        "submitted_at": { "type": "string", "format": "date-time", "description": "Unchanged meaning: when the proposal was submitted, kept as it was when a guest confirms later." }
      },
      "required": ["awaiting_confirmation"]
    },
    "table_users": {
      "description": "Existing table; no columns change.",
      "type": "object",
      "properties": {
        "password_hash": { "type": "string", "description": "'' for guests (and invited reviewers) until they set a password." },
        "role": { "type": "string", "enum": ["speaker", "reviewer", "admin"], "description": "Guests are speakers." }
      }
    },
    "table_email_links": {
      "description": "Table from add-email-links.",
      "type": "object",
      "properties": {
        "purpose": { "type": "string", "enum": ["password_reset", "committee_invite", "confirm_proposal", "claim_account"], "description": "CHANGED: adds confirm_proposal (6 months) and claim_account (7 days)." }
      }
    },
    "payload_speaker": {
      "description": "Existing speaker object in events and API responses. CHANGED: adds account_status; every other property is unchanged.",
      "type": "object",
      "properties": {
        "account_status": { "type": "string", "enum": ["active", "guest"], "description": "NEW: 'guest' when the speaker has not set a password yet." }
      },
      "required": ["account_status"]
    },
    "payload_email_link_requested": {
      "description": "Data of an email_link.requested event (from add-email-links). CHANGED: purpose gains two values; proposals is NEW.",
      "type": "object",
      "properties": {
        "purpose": { "type": "string", "enum": ["password_reset", "committee_invite", "confirm_proposal", "claim_account"], "description": "CHANGED" },
        "proposals": {
          "type": ["array", "null"],
          "description": "NEW: for confirm_proposal, what the guest is confirming; null for other purposes.",
          "items": {
            "type": "object",
            "properties": {
              "title": { "type": "string" },
              "conference": { "type": "string", "description": "Conference name." }
            },
            "required": ["title", "conference"],
            "additionalProperties": false
          }
        }
      },
      "required": ["purpose", "proposals"]
    },
    "export_speakers_row": {
      "description": "speakers export row. CHANGED: adds account_status as the last column; existing columns keep their names and positions.",
      "type": "object",
      "properties": {
        "account_status": { "type": "string", "enum": ["active", "guest"], "description": "NEW" }
      }
    }
  }
}
```

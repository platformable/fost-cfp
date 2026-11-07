# Proposal

## Why

Some speakers will not create an account just to send a proposal, so FOST loses talks it would otherwise get. Speakers should be able to apply as a guest with just their name and email. A guest proposal must only count once the speaker confirms their email, so spam and typos never reach the committee or set off automations. Guests can claim a full account later to edit. The December import of already-collected CFPs reuses the same guest accounts.

This change builds on `add-email-links` (single-use emailed links and accounts without a password), which must be built first.

## What Changes

- **Apply as a guest:** signed-out visitors can submit from the proposal form by adding their first name, last name, email and organisation instead of signing in. The rest of the form is unchanged, including sending one proposal to several conferences.
- **Confirm by email:** a guest submission is saved as **awaiting confirmation** and a confirmation link is emailed (through n8n, as an `email_link.requested` event with the purpose `confirm_proposal`). Until the link is used, the proposal:
  - is not shown to the committee;
  - is not in exports, the API or conference counts;
  - sets off no automations.

  Organisers only see how many are waiting.
- **When confirmed:** the proposals count from then on. `proposal.submitted` is recorded for each conference, and `speaker.registered` the first time for a new guest. The confirmation page shows what was confirmed and offers to set a password straight away.
- **Guests are people without a password:**
  - They cannot sign in or edit.
  - They can claim their account at any time by setting a password through an emailed link. "Forgot your password?" works for this, and so does the confirmation page.
  - Registering with a guest's email sends a claim link instead of saying "account exists".
  - Once claimed, the account is an ordinary speaker account.
- **Existing accounts:** if the email already has an account, the confirmed proposal is added to that account. The form shows the same message either way, so nobody can find out who has an account.
- **Expiry:** unconfirmed proposals, and guest accounts left with no proposals, are deleted 6 months after submission. Confirmation links last as long.
- **Anti-bot check without a third-party captcha:**
  - a hidden field that people never fill in;
  - a minimum time on the form;
  - at most 5 proposals awaiting confirmation per email address.
- **Payloads say whether the speaker is a guest:** the speaker object in events and the API gains `account_status` (`active` or `guest`). n8n can use it to add a "claim your account" line to emails.

## Capabilities

### New Capabilities

- `proposals/guest-submissions`: submitting without an account, email confirmation, what unconfirmed proposals may and may not do, guest accounts and claiming them, expiry, and the anti-bot check.

### Modified Capabilities

- `integrations/event-webhooks`: the speaker object in payloads gains `account_status`.

## Impact

- **Database:** migration `006_guest_submissions.sql`:
  - adds `proposals.awaiting_confirmation`;
  - extends the `email_links` purposes with `confirm_proposal` and `claim_account`;
  - adds an index for the expiry clean-up.
- **Code:**
  - The proposal form and submit action accept signed-out visitors.
  - Every list, count, export and API query must leave out proposals awaiting confirmation. That covers `src/lib/proposals.ts`, `conferences.ts`, `export.ts` and `payloads.ts`.
  - `/link/[token]` handles the two new purposes.
  - The registration form handles guest emails.
  - The worker's daily step deletes expired unconfirmed proposals and empty guest accounts.
  - The People page labels guests.
- **n8n:** the `email_link.requested` branch needs wording for `confirm_proposal` and `claim_account`. Automations on `proposal.submitted` are unchanged, because the event now fires on confirmation.
- **Exports and API:** no columns removed or renamed. The `speakers` export and the speaker payload gain `account_status`, added after all existing export columns.

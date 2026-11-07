# Tasks

Requires `add-email-links` to be applied first.

## 1. Schema and filtering

- [x] 1.1 Add `db/migrations/006_guest_submissions.sql` (`proposals.awaiting_confirmation`, extended `email_links` purpose check, partial index) and verify it applies to a copy of a database at migration 005 and existing tests pass
- [x] 1.2 Add a shared "confirmed proposals only" SQL fragment and use it in every proposal read path (`proposals.ts`, `conferences.ts`, `export.ts`, `payloads.ts`); verify with one integration test that an unconfirmed proposal is absent from every export dataset, the committee list, status counts, conference stats, `listProposalPayloads`, `/api/v1/proposals` and `/api/v1/proposals/{id}` (404)
- [x] 1.3 Add `account_status` to the speaker payload and as the last column of the `speakers` export; verify the payload test's field list and that existing export columns keep their positions

## 2. Guest submission

- [x] 2.1 Let signed-out visitors open `/proposals/new` with an "About you" block, a hidden honeypot field and a signed render-time field; verify in the browser on desktop and phone widths, with copy in plain British English
- [x] 2.2 Add the guest path to the submit action: find or create the speaker account by email without overwriting an existing one, insert proposals awaiting confirmation, record no proposal events, issue a `confirm_proposal` link with the `email_link.requested` event listing titles and conferences, and show the same "check your email" page for new and existing emails; verify with integration tests including a two-conference guest submission and an existing account's email
- [x] 2.3 Enforce the anti-bot rules (honeypot and under 3 seconds: silent refusal; more than 5 awaiting for an email: clear message); verify with integration tests

## 3. Confirmation and claiming

- [x] 3.1 Handle `confirm_proposal` on `/link/[token]`: GET shows what will be confirmed, POST confirms all of the user's proposals awaiting confirmation, records `proposal.submitted` per proposal and `speaker.registered` for a first-time guest, keeps `submitted_at`, and offers an optional set-password form that signs the guest in; verify with integration tests and in the browser
- [x] 3.2 Issue `claim_account` links from the forgot password form for password-less speakers and from registration with a guest's email (no new account, "check your email"); handle `claim_account` on `/link/[token]`; verify with integration tests
- [x] 3.3 Show "awaiting email confirmation" counts per conference on the organiser dashboard, label guests on the People page, and offer a confirmation link there for accounts with proposals awaiting confirmation; verify in the browser

## 4. Expiry

- [x] 4.1 Add the 6-month clean-up to the worker's daily step (unconfirmed proposals, then empty password-less speaker accounts without committee rows or unexpired links); verify with an integration test that moves timestamps back

## 5. Documentation and end-to-end

- [x] 5.1 Update the README: guest submissions, what organisers see, and n8n wording for `confirm_proposal` and `claim_account`; verify the n8n expressions against captured deliveries
- [x] 5.2 With the web server, the worker and a local receiver running, submit as a guest to two conferences, check nothing reaches the committee, exports or the API, confirm through the link, set a password, edit the proposal; verify the events arrive in order (`email_link.requested`, then `speaker.registered` and two `proposal.submitted`) and the proposals appear everywhere

## Workflow follow-up

- Archive with `/opsx:archive` once running on dev-cfp.
- Change 3b (`import-existing-proposals`) reuses guest accounts and `claim_account` links.

# Tasks

## 1. Links

- [ ] 1.1 Add `db/migrations/005_email_links.sql` (table, unique `token_hash`, index on `user_id, purpose, created_at`) and verify `npm run db:migrate` applies it to a copy of a database at migration 004 and existing tests pass
- [ ] 1.2 Add `src/lib/email-links.ts`: issue a link (supersedes older unused links of the same user and purpose, optionally records `email_link.requested` in the same transaction), look one up by token, and use it to set a password (locks the row, signs out other sessions); verify with integration tests for single use, expiry, supersession and that only a hash is stored
- [ ] 1.3 Add `email_link.requested` to the event catalogue and the endpoint form's checkboxes, without adding it to existing endpoints; verify with a test that an endpoint created before the change receives nothing and one that ticks it receives the documented payload

## 2. Forgot password and the link page

- [ ] 2.1 Add `/forgot-password` with the same message for known, unknown and rate-limited emails (3 per email per hour) and a "Forgot your password?" link on the sign-in page; verify with integration tests that unknown emails and the fourth request issue nothing
- [ ] 2.2 Add `/link/[token]`: GET shows the set-password form (or an expired, used or invalid message with a link to request a new one) and never uses the link up; POST sets the password, signs the person in and redirects (speakers to their proposals, reviewers to Review); verify in the browser for a reset and an expired link, with copy in plain British English

## 3. Committee invites

- [ ] 3.1 Let `addReviewer()` create a password-less reviewer account and a `committee_invite` link when the email is unknown and a name is given; add name fields to the committee form and a clear message when they are missing; verify with integration tests and in the browser
- [ ] 3.2 Verify with a test that an account without a password cannot sign in with any password, and can set one through the forgot password form

## 4. Organiser fallback

- [ ] 4.1 Add "Copy password link" on Organise → People (admins only): issues a `password_reset` link without an event and shows it once; verify in the browser and with a test that a reviewer cannot do it

## 5. Documentation and end-to-end

- [ ] 5.1 Add a README section on emailed links: the event, the payload, and an n8n recipe (a Switch branch on `email_link.requested` that sends the email, with wording per purpose); verify the recipe's expressions against a captured delivery
- [ ] 5.2 With the web server, the worker and a local receiver running, request a reset, invite a reviewer and use both links; verify each event arrives once with a working link, used links stop working, and the new passwords sign in

## Workflow follow-up

- Archive with `/opsx:archive` once running on dev-cfp, so `accounts/email-links` becomes a spec and the event catalogue change is merged into `integrations/event-webhooks`.

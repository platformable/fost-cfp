# Proposal

## Why

Today a speaker who forgets their password is stuck: there is no reset, and an organiser can only change their role. Organisers can only add committee members who have already registered. Guest submissions (change 3) and the December CFP import both need a safe way to prove that someone owns an email address and let them set a password. All of these need the same thing: a single-use link sent to the person's email. Integration events now reach n8n, so the app can ask n8n to send those emails instead of sending mail itself.

## What Changes

- **One emailed-link mechanism** for every "prove you own this email" flow. Each link is single-use, expires, and works only for its purpose. Only a hash of each link's secret is stored.
- **Forgot password:** a "Forgot your password?" link on the sign-in page. The speaker enters their email and the app always replies with the same message, whether or not an account exists, so nobody can use the form to find out who has an account. The link expires after 24 hours and lets them choose a new password; using it signs them in and signs out their other sessions.
- **Committee invites:** organisers can add someone who has no account yet by entering their name and email. The app creates a reviewer account with no password, adds the person to the committee and sends them an invite link (valid for 7 days) to set a password. Adding someone who already has an account works as today.
- **Accounts without a password:** an account can exist before its owner sets a password (invited reviewers now, guests in change 3). It cannot be signed into with a password until one is set through an emailed link.
- **Sending through n8n:** the app records a new **`email_link.requested`** event, with the recipient, the purpose, the link and its expiry. An n8n workflow sends the email. The event is only sent to endpoints that tick it, so existing endpoints are unaffected until an organiser opts in.
- **Organiser fallback:** on Organise → People, organisers can create a password link for any account and copy it, for when an email does not arrive. The link is shown once and no email is sent.
- **Rate limits:** at most 3 password links per email address per hour; older unused links for the same person and purpose stop working when a new one is issued.

## Capabilities

### New Capabilities

- `accounts/email-links`: single-use emailed links (password reset, committee invites, and the purposes later changes add), their lifetime and limits, how they are delivered through n8n, the organiser fallback, and accounts that exist before a password is set.

### Modified Capabilities

- `integrations/event-webhooks`: the event catalogue gains `email_link.requested`.

## Impact

- **Database:** migration `005_email_links.sql` adds an `email_links` table. Accounts with no password keep an empty `password_hash` (the column stays NOT NULL).
- **Code:** new `src/lib/email-links.ts`; changes to `src/lib/auth.ts` (no sign-in without a password), `src/lib/conferences.ts` (invite by email), `src/lib/events.ts` (new event type); new pages `/forgot-password` and `/link/[token]`; sign-in page link; People page "Copy password link"; committee form gains name fields.
- **n8n:** a workflow (or a branch of the existing one) on `email_link.requested` that sends the email. The README gets a ready-made recipe. Until it exists, organisers use the copy-link fallback.
- **Privacy:** the link travels in the event payload to n8n over signed HTTPS, like other personal data. Event bodies are deleted after 30 days, after every link has expired.
- **Exports and API:** unchanged.

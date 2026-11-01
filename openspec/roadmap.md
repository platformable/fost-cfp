# FOST Call for Speakers: roadmap

The big picture behind the individual OpenSpec changes. Each change is proposed, built and archived on its own (`/opsx:propose` → `/opsx:apply` → `/opsx:archive`); this page keeps the order, the dependencies and the decisions that every proposal must respect. It is a plain reference document, not an OpenSpec artifact. Update it when a decision changes or a change ships.

## Where we are heading

The app becomes the system of record for a speaker's whole relationship with FOST, from proposal to program to evaluation. Organisers get one workflow; speakers get an account page that grows into a record of their talks, decks, photos and transcripts. The app announces what happens; n8n does the follow-up work (emails, newsletter, consent form, Pipedrive, spreadsheets).

```
 SPEAKER JOURNEY
 call opens --> proposal (account or confirmed guest) --> automations (n8n):
                                                          receipt email, Soirée newsletter,
                                                          consent form (Formbricks), Pipedrive,
                                                          VP+ sponsor/VIP research
            --> keeps proposal up to date --> decision waves --> confirms slot
            --> slides, speaker card --> after the event: photos + captions,
                transcript, attendance, consent reminder

 ORGANISER / COMMITTEE JOURNEY (dates relative to the conference)
 new proposal email to the topic's committee
 T-3 months  review all, approve; organiser sends "accepted" wave; approved
             speakers copied to the event overview spreadsheet
 T-2 months  organiser sends "clear no" wave; program ~90% complete;
             speaker cards created
 T-1 month   organiser sends waitlist and late "no" wave
 T-2 weeks   call closes; dashboard shows every speaker their outcome and notes
 after       photos, transcripts, attendance import, performance dashboard
```

## Planned changes, in build order

| # | Change | What it delivers | Needs | Status |
|---|---|---|---|---|
| 0 | `support-month-only-conference-dates` | Open a call when only the conference month is known ("June 2027"); add exact dates later | none | Proposed |
| 1 | `add-integration-events` | Signed webhooks to n8n for every meaningful change; API keys and read API for n8n | none | Proposed |
| 2 | `add-email-links` | Single-use emailed links, sent via n8n: password reset for everyone, committee invites; organiser "copy reset link" fallback | 1 | Not started |
| 2b | `update-default-session-formats` | New conferences start with Talk (25 min), Panel (25 min), Q&A Onstage (25 min) and Workshop (50 min), still editable per conference; existing conferences keep their formats | none | Planned for mid-December 2026 |
| 3 | `add-guest-submissions` | Apply without an account; proposal counts only after the emailed confirmation; read-only until claimed; anti-bot check | 1, 2 | Not started |
| 3b | `import-existing-proposals` | Organiser uploads the CFPs already collected for next year's conferences (preview before saving); new people become guests, known emails attach to their account; one `speaker.imported` event per person so n8n sends the "claim your account" email; speakers who never claim stay guests | 1, 2, guest model from 3 | Planned for mid-December 2026 |
| 4 | `add-staged-decisions` | Per-proposal "speaker informed"; organiser-sent waves (accepted, clear no, waitlist); conference milestones for n8n's daily reminders; replaces the single "publish decisions" switch | 1 | Not started |
| 5 | `add-mini-conference-committees` | Topics become mini-conferences (e.g. GreenIO) with their own committee; reviewers see only their topics | none | Not started |
| 6 | `add-speaker-record` | Consent once per person (Formbricks via n8n write-back), sponsor/VIP lead flags and research notes, organiser notes about a speaker | 1 | Not started |
| 7 | `add-speaker-assets` | Slide uploads, speaker cards, photos with proposed captions, transcripts, session date and time, attendance import | 1; file storage | Not started |
| 8 | `add-program-dashboard` | Per conference: dates 80% and 90% of the program filled, gender breakdown, most popular talks, % consent done, % slides uploaded | 5, 6, 7 | Not started |

## Decisions agreed

- **n8n owns all automations.** The app sends no email and has no direct Pipedrive, Soirée or Formbricks integration. It announces events (signed webhooks) and accepts results back (authenticated API).
- **Pipedrive is Mark's personal tool**, kept up to date one way by n8n. Anything every organiser needs (consent status, lead flags, research notes, organiser notes) lives in the app.
- **LinkedIn connection to-dos are Mark's only** and stay out of the app (they belong in Pipedrive). LinkedIn connections cannot be automated.
- **Decision waves are sent by an organiser**, never automatically by date. The app records who was informed and when; n8n sends the letters; dates drive reminders only.
- **The app owns each conference's milestone dates; n8n owns the clock** (a daily schedule asks which milestones are due).
- **Guests are people without passwords.** Same consent and automations as everyone; read-only proposals; claim later by emailed link.
- **A guest proposal counts only once its emailed confirmation link is clicked.** Until then: no automations; unconfirmed proposals expire.
- **One emailed single-use link mechanism** (via n8n) covers password reset, claiming guest proposals and committee invites, with an organiser "copy reset link" fallback.
- **Topic and mini-conference are the same thing.**
- **Conferences can open their call with only the month known**; exact dates are added later.
- **Program capacity differs per conference** and is only known closer to the event, so it must be editable at any time.
- **Consent form moves from Typeform to Formbricks**, once per person across all conferences.
- **Gender wording** for the dashboard will be provided by Mark.
- **Hosting:** OVHcloud or Scaleway, as a long-running server with a separate background worker.
- **Every OpenSpec design includes a JSON Schema of its data model** (rule in `openspec/config.yaml`).

## Proposed for the mid-December work (to confirm when the changes are proposed)

- **Default formats apply to new conferences only.** The new list is copied into a conference's formats when it is created, so live calls and existing proposals ("Talk (30 min)") are not relabelled.
- **Claiming an imported account is "set your password"**, using the emailed single-use link from change 2, with a longer expiry (around 30 days) for the bulk email and "Forgot password" as the fallback.
- **The import file uses the `submissions` export's column names**, so the same layout works in and out.
- **Imported proposals do not trigger new-proposal automations** (receipt email, newsletter, Pipedrive). They keep their original submitted date and are marked `source = import`.
- **One person per email**: several rows with the same email become one speaker with several proposals.

## Open questions, and the change that must answer them

| Question | Change |
|---|---|
| How long an unconfirmed guest proposal is kept before it expires | 3 |
| Store session length separately (25, 50 minutes) for scheduling, or keep it in the label | 2b |
| Where the existing CFPs live (Typeform, Google Sheet…) and a sample row to map columns | 3b |
| Whether any imported proposals already have a decision, or all arrive as submitted | 3b |
| Whether the old form's terms cover moving speakers' details into this app, and if the claim email should link the Formbricks consent form | 3b |
| If changes 1 and 2 are not ready in December: send claim links from an exported spreadsheet (mail merge or n8n) as a stopgap | 3b |
| Exact milestone offsets per conference (fixed T-3m/T-2m/T-1m/T-2w or editable) | 4 |
| Which file storage (OVHcloud or Scaleway Object Storage) and size limits for decks and photos | 7 |
| Speaker card design and what it shows | 7 |
| Attendance spreadsheet columns | 7 |
| Gender field wording (from Mark) and who may see it | 8 |
| How "program filled" is counted (accepted, or accepted and confirmed) against capacity | 8 |

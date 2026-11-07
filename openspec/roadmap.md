# FOST Call for Speakers: roadmap

The big picture behind the individual OpenSpec changes. Each change is proposed, built and archived on its own (`/opsx:propose` → `/opsx:apply` → `/opsx:archive`); this page keeps the order, the dependencies and the decisions that every proposal must respect. It is a plain reference document, not an OpenSpec artifact. Update it when a decision changes or a change ships.

## Where we are heading

The app becomes the system of record for a speaker's whole relationship with FOST, from proposal to program to evaluation. Organisers get one workflow; speakers get an account page that grows into a record of their talks, decks, photos and transcripts. The app announces what happens; n8n does the follow-up work (emails, newsletter, consent form, Pipedrive, spreadsheets).

```
 SPEAKER JOURNEY
 call opens --> proposal (account, confirmed guest, or imported from Typeform)
            --> automations (n8n): receipt email, Soiree newsletter, consent form (Formbricks),
                Pipedrive (LinkedIn to-dos; CMO outreach for vendor speakers)
            --> keeps proposal up to date --> outcome letters in waves --> confirms (or cancels)
            --> slides, speaker card --> after the event: photos + captions, transcript,
                attendance, consent reminder

 ORGANISER / COMMITTEE JOURNEY (dates relative to the conference; milestones remind, organisers send)
 intake      every proposal lands in the app and on the conference overview sheet;
             vendor and sponsor proposals are waitlisted automatically (see rules below)
 T-3 months  first wave: yes / no / waitlist to everyone decided
 T-2 months  second wave: most of the waitlist resolved; reminders to accepted speakers
 T-1 month   final review of everything still waitlisted, then a last wave
 after       photos, transcripts, attendance import, performance dashboard
```

## Plan to the January 2027 reviews

```
 Nov 2026   cfp.joinfost.io production site (setup, not a change) -- before any real data goes in
            3b import-existing-proposals: bulk import + Typeform -> n8n -> app sync (app is a silent mirror)
            4  add-overview-sheet-sync: conference overview Google Sheet <-> app
 Dec 2026   5  add-staged-decisions: flexible outcome waves, cancellations, final-review alert
            6  add-proposal-groups: same-speaker groups, vendor and sponsor rules, CMO outreach via Pipedrive
 mid-Dec    cutover: claim-your-account emails, Typeform off, CFP links point to the app,
            TEST_ONLY = [] in n8n's "Write email", automations on, dev-cfp becomes the test site
 Jan 2027   committee reviews and decides in the app (and the overview sheet)
```

Changes 5 and 6 may be built in either order; both must exist before reviews start in January.

## Planned changes, in build order

| # | Change | What it delivers | Needs | Status |
|---|---|---|---|---|
| 0 | `support-month-only-conference-dates` | Open a call when only the conference month is known ("June 2027"); add exact dates later | none | Shipped and archived (4 Nov 2026) |
| 1 | `add-integration-events` | Signed webhooks to n8n for every meaningful change; API keys and read API for n8n | none | Shipped and archived (6 Nov 2026) |
| 2 | `add-email-links` | Single-use emailed links, sent via n8n: password reset for everyone, committee invites; organiser "copy reset link" fallback | 1 | Shipped and archived (7 Nov 2026) |
| 2b | `update-default-session-formats` | Talk (25 min), Panel (25 min), Q&A Onstage (25 min) and Workshop (50 min) become the defaults and are written into every existing conference; proposals keep their submitted format | none | Shipped and archived (6 Nov 2026) |
| 3 | `add-guest-submissions` | Apply without an account; proposal counts only after the emailed confirmation; read-only until claimed; anti-bot check | 1, 2 | Shipped and archived (7 Nov 2026) |
| 3b | `import-existing-proposals` | Bulk upload of the Typeform CFPs (preview before saving) and a write endpoint so n8n adds each new Typeform response as it arrives; people become guests whose proposals already count; known emails attach to their account; organisers mark the early (visa) approvals as accepted and already told; `proposal.imported` event (not `proposal.submitted`) | 1, 3 | Planned for November 2026 |
| 4 | `add-overview-sheet-sync` | Each conference's overview Google Sheet: a "CFPs received" tab (every proposal and its outcome) and an accepted-speakers tab with email-progress columns; the Decision column edits the app through a decision API; `proposal.decided` event; overview sheet link per conference; emails sent by n8n recorded in the app | 1, 3b | Not started |
| 5 | `add-staged-decisions` | One "send outcomes" action that writes only to people whose situation changed; speakers see an outcome once told; organisers record cancellations on a speaker's behalf; "slot freed" alert listing the waitlist; T-1 final-review alert; replaces the single "publish decisions" switch | 1, 4 | Not started |
| 6 | `add-proposal-groups` | Same-speaker groups; vendor matching against the API & AI landscape database; confirmed sponsors read from the overview sheet's Sponsors tab; automatic waitlisting with a reason for vendor and sponsor proposals; CMO outreach in Pipedrive with a daily "drafts to send" email; sponsored-session mark | 1, 4, 5 | Not started |
| 7 | `add-mini-conference-committees` | Topics become mini-conferences (e.g. GreenIO) with their own committee; reviewers see only their topics | none | Not started |
| 8 | `add-speaker-record` | Consent once per person (Formbricks via n8n write-back), sponsor/VIP lead flags and research notes, organiser notes about a speaker | 1 | Not started |
| 9 | `add-speaker-assets` | Slide uploads, speaker cards, photos with proposed captions, transcripts, session date and time, attendance import | 1; file storage | Not started |
| 10 | `add-program-dashboard` | Per conference: dates 80% and 90% of the program filled, gender breakdown, most popular talks, % consent done, % slides uploaded | 7, 8, 9 | Not started |

## Decisions agreed

### Platform and automation

- **n8n owns all automations.** The app sends no email and has no direct Pipedrive, Soirée, Formbricks or Google Sheets integration. It announces events (signed webhooks) and accepts results back (authenticated API).
- **The app is the record; spreadsheets are windows onto it.** Where a sheet can change something, it goes through the app's API, and the app's answer is written back.
- **Pipedrive is Mark's personal tool.** n8n keeps it up to date and may read it (for example to find a CMO); nothing every organiser needs lives only in Pipedrive.
- **LinkedIn connection to-dos are Mark's only** and stay in Pipedrive. LinkedIn connections cannot be automated.
- **Hosting:** OVHcloud or Scaleway, as a long-running server with a separate background worker. **File storage is OVHcloud Object Storage** for slides, photos and other speaker files (change 9).
- **Production lives at a joinfost.io subdomain (for example cfp.joinfost.io) with its own database**, set up before real speaker data is imported. dev-cfp.platformable.com stays the test site and never holds real speaker data. Each environment has its own n8n endpoint, signing secret and API key.
- **Every OpenSpec design includes a JSON Schema of its data model** (rule in `openspec/config.yaml`).

### Intake and the move from Typeform (change 3b, cutover)

- **Until mid-December the app is a silent mirror of Typeform.** Existing CFPs are bulk imported; each new Typeform response is added by n8n through the app's API. Typeform and the current outreach keep running unchanged.
- **Nobody is told anything during the parallel run.** Imported proposals record `proposal.imported`, not `proposal.submitted`, so only Mark's own branches react (Pipedrive LinkedIn to-dos for Mark's and the FOST LinkedIn accounts). n8n's `TEST_ONLY` list keeps every email to testers.
- **Imported speakers are guests whose proposals already count** (they accepted Typeform's terms): no confirmation step, `account_status` is `guest` until they claim the account.
- **Early (visa) approvals are marked accepted and already told** when imported or by an organiser in the app.
- **At cutover**, imported speakers get a "claim your account" email (link valid about 30 days, "Forgot your password?" as the fallback), Typeform is turned off and every CFP link points to the app.
- **The import uses the `submissions` export's column names** where it can, and one person per email: several rows with the same email become one speaker with several proposals.

### Decisions and letters (changes 4 and 5)

- **One decision per proposal** (yes / waitlist / no = accepted / waitlisted / rejected) and **a record of every outcome letter sent**.
- **Waves are flexible and always sent by an organiser** with one "send outcomes" action; milestones (T-3, T-2, T-1 months by default, editable per conference) only remind. A wave writes to: anyone with a decision who has never been told; anyone told "waitlist" whose decision is now yes or no; and, if the organiser ticks it, accepted speakers as a reminder. Nobody else.
- **No letter to people still waitlisted** after T-2; the Soirée newsletter reminds them (n8n keeps a "waitlisted" tag in Soirée).
- **Speakers see an outcome in the app once they have been told it.**
- **T-1 final review:** organisers get an alert listing everything still waitlisted, with each reason (ordinary waitlist, sponsorship conversation, from a sponsor, paid slot offered).
- **A speaker pulling out is their cancellation, not a changed decision.** Decision stays yes; the speaker (or an organiser on their behalf) records the cancellation. Organisers get a "slot freed" alert with the waitlist for that conference.

### Conference overview sheet (change 4)

- **One overview sheet per conference already exists**; the app stores its link. n8n writes two tabs and reads one:
  - **CFPs received**: every proposal (keyed by a protected proposal id column) with its decision (Yes / Waitlist / No dropdown) and group or reason.
  - **Speakers**: accepted speakers, with columns for received CFP, informed of interim outcome (date of the first letter), confirmed of final outcome (date of the letter that settled them as a definite yes or no), added to Soirée, attendance confirmed by the speaker, registered for the event. Rows are never deleted; a cancelled speaker is marked "Cancelled by speaker".
  - **Sponsors** (read only): confirmed sponsors only, maintained by the team.
- **Only the Decision column flows back into the app**, and only for proposals nobody has been told about yet or that were told "waitlist" (moving them to yes or no). Changing anything a speaker has already been told (yes → no, no → yes) is refused with a note and must be done in the app. Invalid values are refused with a note next to the cell.
- **Sheet edits record who made them** (an Apps Script on the sheet sends the editor's email to n8n).
- **"Registered for the event" is ticked by hand** in the sheet for now and is not synced to the app; the ticketing system's API may automate it in 2027.
- **Emails n8n sends are reported back to the app** (for example "receipt sent", "added to Soirée"), so the sheet's columns and later dashboards read from one record.

### Vendors, sponsors and multiple talks (change 6)

| Speaker's organisation at the conference | What happens |
|---|---|
| Not a vendor, 1 proposal | Normal review |
| Not a vendor, 2+ proposals from the same speaker | Same-speaker group: the committee picks the best fit and rejects the rest |
| Vendor that is not a sponsor (any number of proposals) | Waitlisted with the reason "sponsorship conversation"; CMO outreach starts |
| Confirmed sponsor of that conference (any number) | Waitlisted with the reason "from a sponsor"; organisers approve, offer a paid slot, or reject |
| Vendor that later appears on the Sponsors tab | Reason changes to "from a sponsor" and organisers get an alert to decide |

- **Vendors come from the API & AI landscape database** (synced into the app by n8n). Speakers are matched by email domain first, then organisation name; an organiser can confirm or correct a match.
- **Sponsors come only from the overview sheet's Sponsors tab** (confirmed sponsors). Pipedrive deal stages do not change anything in the app.
- **One conversation per vendor per conference:** the first proposal starts it; later ones from the same vendor are added to the same conversation.
- **CMO outreach happens in Pipedrive, using only the existing CMO-outreach pipeline and fields** ("FOSTBeat CMO relationships" and the `CMO …` deal, organisation and person fields). The vendor flow adds no new Pipedrive fields. n8n looks for the vendor's CMO (a person at the organisation with a CMO role); if found and not marked `CMO opted out`, it prepares an email to the applicant(s) with the CMO in copy for Mark to send, adding a sales team member; if not found, it creates a "find the CMO" to-do. Mark gets one daily email listing drafts to send and CMOs to find.
- **Sponsors get no extra talks through the CFP by default.** A CFP from a sponsor's staff is waitlisted; organisers may approve an excellent talk, offer a paid slot (accepted talks bought this way are marked as sponsored sessions), or reject.

### Speakers and accounts

- **Guests are people without passwords.** Same consent and automations as everyone; read-only proposals; claim later by emailed link.
- **A guest proposal counts only once its emailed confirmation link is clicked.** Until then: no automations; unconfirmed proposals expire after 6 months.
- **One emailed single-use link mechanism** (via n8n) covers password reset, claiming guest accounts, guest confirmations and committee invites, with an organiser "copy link" fallback.
- **Consent form moves from Typeform to Formbricks**, once per person across all conferences.
- **Gender question wording:** "What is your gender?" with the options Female, Male, Prefer not to say, Other (change 10).

### Conferences

- **Every conference uses the new session formats** (Talk, Panel and Q&A Onstage at 25 minutes, Workshop at 50). Proposals keep the format they were submitted with.
- **Conferences can open their call with only the month known**; exact dates are added later.
- **Milestone dates are editable per conference**: T-3 months, T-2 months, T-1 month and T-2 weeks are only the defaults.
- **Program capacity differs per conference** and is only known closer to the event, so it must be editable at any time.
- **Topic and mini-conference are the same thing.**

## Open questions, and the change that must answer them

| Question | Change |
|---|---|
| A sample of the Typeform CFP export (fake data is fine) to map its fields | 3b |
| Whether Typeform's terms cover moving speakers' details into this app, and whether the claim email should link the Formbricks consent form | 3b |
| Whether n8n can create Pipedrive mail drafts (built-in node or Pipedrive's API); if not, a Pipedrive activity with the text ready to copy | 6 |
| Which existing `CMO …` fields hold the vendor email (for example `CMO email subject` / `CMO email body` or the hand-off fields) and which stage the deal starts in | 6 |
| Where the API & AI landscape database lives and its column names (name, website or domain, vendor or not) | 6 |
| Whether the first wave skips proposals waitlisted for a "sponsorship conversation", so those speakers hear nothing until it ends | 5, 6 |
| How talks that sponsors buy outside the CFP are added to the program | 6 |
| Size limits for decks and photos on OVHcloud Object Storage | 9 |
| Speaker card design and what it shows | 9 |
| Attendance spreadsheet columns | 9 |
| Who may see a speaker's gender answer, and whether "Other" has a free-text box | 10 |
| How "program filled" is counted (accepted, or accepted and confirmed) against capacity | 10 |

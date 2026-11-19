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
            --> slides, speaker card --> after the event: thank-you with their photos and
                audience figures, then their transcript (MCs get the same)

 ORGANISER / COMMITTEE JOURNEY (dates relative to the conference; milestones remind, organisers send)
 intake      every proposal lands in the app and on the conference overview sheet;
             vendor and sponsor proposals are waitlisted automatically (see rules below)
 T-3 months  first wave: yes / no / waitlist to everyone decided
 T-2 months  second wave: most of the waitlist resolved; reminders to accepted speakers
 T-1 month   final review of everything still waitlisted, then a last wave
 after       program read from the program sheet, photos matched to talks, thank-yous,
             transcripts, performance dashboard
```

## Plan to the January 2027 reviews

```
 Nov 2026   cfp.joinfost.io production site (setup, not a change) -- before any real data goes in
            3b import-existing-proposals: bulk import + Typeform -> n8n -> app sync (app is a silent mirror)
            4  add-overview-sheet-sync: conference overview Google Sheet <-> app
 Dec 2026   5  add-staged-decisions: flexible outcome waves, cancellations, final-review alert
            6  add-proposal-groups: same-speaker groups, vendor and sponsor rules, CMO outreach via Pipedrive
            7  add-speaker-agreements: code of conduct + AI consent once per person, reminders every 3 days
            12 explore-invited-speakers: explore and design before the end of December, so FOST New York
               and FOST Singapore speaker outreach runs from this app from mid January 2027
            3c add-bluesky-profile: optional Bluesky field next to LinkedIn, before the cutover
 mid-Dec    cutover: claim-your-account emails, Typeform off, CFP links point to the app,
            TEST_ONLY = [] in n8n's "Write email", automations on, dev-cfp becomes the test site
 Jan 2027   committee reviews and decides in the app (and the overview sheet)
```

Changes 5 and 6 may be built in either order; both must exist before reviews start in January. Change 7 must exist before the first acceptance letters (T-3 wave).

## Planned changes, in build order

| # | Change | What it delivers | Needs | Status |
|---|---|---|---|---|
| 0 | `support-month-only-conference-dates` | Open a call when only the conference month is known ("June 2027"); add exact dates later | none | Shipped and archived (4 Nov 2026) |
| 1 | `add-integration-events` | Signed webhooks to n8n for every meaningful change; API keys and read API for n8n | none | Shipped and archived (6 Nov 2026) |
| 2 | `add-email-links` | Single-use emailed links, sent via n8n: password reset for everyone, committee invites; organiser "copy reset link" fallback | 1 | Shipped and archived (7 Nov 2026) |
| 2b | `update-default-session-formats` | Talk (25 min), Panel (25 min), Q&A Onstage (25 min) and Workshop (50 min) become the defaults and are written into every existing conference; proposals keep their submitted format | none | Shipped and archived (6 Nov 2026) |
| 3 | `add-guest-submissions` | Apply without an account; proposal counts only after the emailed confirmation; read-only until claimed; anti-bot check | 1, 2 | Shipped and archived (7 Nov 2026) |
| 3b | `import-existing-proposals` | Bulk upload of the Typeform CFPs (preview before saving) and a write endpoint so n8n adds each new Typeform response as it arrives; people become guests whose proposals already count; known emails attach to their account; organisers mark the early (visa) approvals as accepted and already told; `proposal.imported` event (not `proposal.submitted`) | 1, 3 | Shipped (8 Nov 2026); archive once running in production |
| 3c | `add-bluesky-profile` | Optional Bluesky profile on the speaker profile, next to LinkedIn: accepts a handle (`@name.bsky.social`, custom-domain handles) or a `https://bsky.app/profile/...` address and stores the address; in speaker payloads, the API and as a new last column of the speakers and submissions exports | none | Shipped and archived (12 Nov 2026) |
| 4 | `add-overview-sheet-sync` | Each conference's overview Google Sheet: a "CFPs received" tab (every proposal and its outcome) and an accepted-speakers tab with email-progress columns; the Decision column edits the app through a decision API; `proposal.decided` event; overview sheet link per conference; emails sent by n8n recorded in the app | 1, 3b | Not started |
| 5 | `add-staged-decisions` | One "send outcomes" action that writes only to people whose situation changed; a "Speaker registration details" field per conference, emailed by n8n when a speaker confirms; speakers see an outcome once told; organisers record cancellations on a speaker's behalf; "slot freed" alert listing the waitlist; T-1 final-review alert; replaces the single "publish decisions" switch | 1, 4 | Not started |
| 6 | `add-proposal-groups` | Same-speaker groups; vendor matching against the API & AI landscape database; confirmed sponsors read from the overview sheet's Sponsors tab; automatic waitlisting with a reason for vendor and sponsor proposals; CMO outreach in Pipedrive with a daily "drafts to send" email; sponsored-session mark | 1, 4, 5 | Not started |
| 7 | `add-speaker-agreements` | Code of conduct (Yes/No, link to beat.joinfost.io/code-of-conduct) and AI consent (questions from the Typeform consent form), once per person, recorded in the app with date and version; a "Speaker agreements" profile section and an emailed-link page for guests; reminders every 3 days while outstanding; import of the existing Typeform consent forms | 2, 5 | Not started |
| 8 | `add-mini-conference-committees` | Topics become mini-conferences (e.g. GreenIO) with their own committee; reviewers see only their topics | none | Not started |
| 9 | `add-speaker-record` | Sponsor/VIP lead flags and research notes, organiser notes about a speaker | 1 | Not started |
| 10a | `add-speaker-assets` | Before the event: slide uploads and speaker cards | 1; file storage | Not started |
| 10b | `import-conference-program` | Reads each conference's program sheet (program tabs, MC plan, track performance): talks matched to proposals by title, MCs per stage and block, headcounts and room capacity. Unmatched items go to a list an organiser resolves. The app never builds programs | 1 | Not started |
| 10c | `add-event-photos` | Photo sources (shared Drive folders: who took them, MC stage, clock offset); photos matched to talks and MC slots by time and stage, or by file order; organiser confirms; "your photos" on the speaker's page plus a link to the gallery | 10b | Not started |
| 10d | `add-after-event-follow-up` | Thank-you emails to speakers and MCs within a few days, with their photos and audience figures; transcripts received from the Pulse pipeline through the API, then a "your transcript" email | 10b, 10c, 7 | Not started |
| 11 | `add-program-dashboard` | Per conference: dates 80% and 90% of the program filled, gender breakdown, most popular talks, % consent done, % slides uploaded | 8, 9, 10a, 10b | Not started |
| 12 | `explore-invited-speakers` | Explore how speakers FOST invites, not only those who answer the call, are brought into the app, so speaker outreach for FOST New York and FOST Singapore runs from here. Scope is decided when the change is explored | to be explored | Not started; explore and design before the end of December 2026 |
| 13 | `add-fostbeat-author-handoff` | A button on the speaker profile sets up their FOSTBeat author (creator) profile in Strapi from the app (headshot, bio, job title, organisation, LinkedIn, Bluesky); when their transcript arrives, a draft article is created for them in Strapi from it, with their photos and slide deck in the media library | 7, 10a, 10c, 10d | Not started; a later sprint |

## Decisions agreed

### Platform and automation

- **n8n owns all automations.** The app sends no email and has no direct Pipedrive, Soirée, Formbricks or Google Sheets integration. It announces events (signed webhooks) and accepts results back (authenticated API).
- **The app is the record; spreadsheets are windows onto it.** Where a sheet can change something, it goes through the app's API, and the app's answer is written back.
- **Pipedrive is Mark's personal tool.** n8n keeps it up to date and may read it (for example to find a CMO); nothing every organiser needs lives only in Pipedrive.
- **LinkedIn connection to-dos are Mark's only** and stay in Pipedrive. LinkedIn connections cannot be automated.
- **Hosting:** OVHcloud or Scaleway, as a long-running server with a separate background worker. **File storage is OVHcloud Object Storage** for slides, photos and other files speakers upload (change 10a). **Upload limits:** 3 MB per photo and 6 MB per slide deck (agreed 9 Nov 2026). Event photos from photographers and MCs stay in their shared Google Drive folders and are not copied (change 10c).
- **Production lives at a joinfost.io subdomain (for example cfp.joinfost.io) with its own database**, set up before real speaker data is imported. dev-cfp.platformable.com stays the test site and never holds real speaker data. Each environment has its own n8n endpoint, signing secret and API key.
- **Every OpenSpec design includes a JSON Schema of its data model** (rule in `openspec/config.yaml`).
- **Speaker outreach moves into this project** (agreed 11 Nov 2026). FOST Paris speaker outreach ran from a local tool (`~/test`) and closed on 4 November 2026; that tool is being archived. Outreach to invited speakers for FOST New York and FOST Singapore (from mid January 2027) runs from this app, through change 12.

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
- **Speaker agreements live in the app, once per person** (change 7), replacing the earlier Formbricks plan:
  - **Code of conduct:** "Do you accept the FOST code of conduct (https://beat.joinfost.io/code-of-conduct)?" Yes/No. Only Yes completes it; a No is flagged to organisers. The app records the date and a version label, so a substantially changed text can be asked again.
  - **AI consent**, from the Typeform consent form: (1) discoverability, Allowed / Prohibited; (2) remixing into new formats without modification or rephrasing, Allowed / Prohibited; (3) "Permission for use of AI to modify your FOST content", any of: first-person articles under my byline, third-person articles not attributed to me, I review before publication, or "PROHIBITED: my content may not be modified by AI" (which excludes the others). Prohibited wording follows the allowed wording, e.g. "PROHIBITED: AI may not be used to process my content for discoverability".
  - **Speakers with an account** complete them on their profile; **guests** use an emailed single-use link (no sign-in needed), with an optional "also set a password".
  - **The acceptance letter asks for them; reminders every 3 days** (n8n's daily check, with a fresh link each time) until both are done, the speaker cancels or the conference starts. They never block confirming attendance or receiving registration details.
  - **The existing Typeform consent forms (41)** are imported by email, keeping their dates and marked "from Typeform"; the consent form had no code of conduct question, so those speakers are still asked to accept it.
- **Registration details on confirmation** (change 5): each conference has a "Speaker registration details" field (link, code, instructions); n8n emails it when a speaker confirms. Registration itself stays manual (ticked by hand on the overview sheet) until the ticketing system's API can be used.
- **Gender and MC interest are optional profile fields** (change 3b). Gender ("What is your gender?": Female, Male, Prefer not to say, Other) is seen only by the speaker and organisers and never leaves the app; the dashboard (change 11) decides whether totals are shown. MC interest goes to n8n (`mc_interest`), which fills an MC tab on the overview sheet and starts an MC email thread (change 4).
- **Typeform's sponsoring and APIMasters questions are not imported.** Sponsorship comes from vendor outreach (change 6); APIMasters is not used in any process yet.
- **Topics that cannot be matched on import go on a topic exceptions list** for an organiser to resolve; conferences' topic lists are never changed automatically.

### Conferences

- **Every conference uses the new session formats** (Talk, Panel and Q&A Onstage at 25 minutes, Workshop at 50). Proposals keep the format they were submitted with.
- **Conferences can open their call with only the month known**; exact dates are added later.
- **Milestone dates are editable per conference**: T-3 months, T-2 months, T-1 month and T-2 weeks are only the defaults.
- **Program capacity differs per conference** and is only known closer to the event, so it must be editable at any time.
- **Topic and mini-conference are the same thing.**

### After the event (changes 10b, 10c, 10d)

Agreed 12 Nov 2026.

- **The app reads programs; it never builds them.** Programs are made in each conference's program sheet (a different domain); this app engages and supports speakers and creators. Change 10b imports from the sheet:
  - **Talks** from the day tabs (rows are start times, columns are stages, a cell holds the title then the speakers; some cells hold several talks with their own times), matched to proposals by title.
  - **MCs** from the MC plan, per stage and block (morning, early afternoon, late afternoon). They are part of the program like speakers.
  - **Headcounts** from the track performance tabs, and **room capacity** from the stage headers ("STAGE 1 (162 PAX)").
- **Every program sheet has the same tabs and layout**; some have extra tabs, which the import ignores. Sheets can hold small errors (for example a track performance tab for day 2 headed "Day 1"), so the import shows a preview and warns about anything inconsistent, such as a tab's day heading not matching its name, instead of trusting it silently.
- **Unmatched program items go on a list for an organiser**, who chooses per item: match to a proposal, invited speaker (followed up; added as a guest if they have no account), or sponsor session (skipped). Choices are remembered for re-imports.
  - **Keynotes and other invited speakers are followed up** like CFP speakers, as guests if needed (see change 12).
  - **Sponsor sessions get no follow-up from this app.** Thanking sponsors and evaluating their experience is the partnership managers' job. "Sponsor" MC slots are skipped.
  - **MCs named by first name only** ("Mehdi") go on the list for an organiser to match by hand.
- **Event photos stay in their shared Google Drive folders**; the app keeps only a list (file id, name, thumbnail link, time taken) and who each photo belongs to. About 200 to 400 photos a day.
  - **Each folder is a photo source**: who took them (the photographer or an MC), the stage (for an MC), and a clock offset (the photographer's camera can be on the wrong time; matching one known photo sets it).
  - **Matching:** by the camera time against the program. MC photos match their stage exactly. Stages run in parallel and one photographer moves between them, so the photographer's photos are grouped into bursts and the organiser picks the stage once per burst. Photos without a camera time (some photographers' exports) are matched by file order, with the organiser marking where each talk starts. Never by face recognition.
  - **One photo can belong to several people** (an MC introducing a speaker).
  - **MC photos wait for an organiser's OK** before reaching anyone's page; the photographer's do not. iPhone HEIC photos are converted to JPG.
  - **Speakers and MCs get "your photos" plus a link to the full gallery** to pick more.
- **Follow-up arrives in two steps** (option B): a thank-you within a few days with their photos (or "your photos are coming") and audience figures, then a "your transcript is ready" email when the transcript arrives, usually after a couple of weeks. The speaker's page always shows what has arrived. MCs get the same thank-you.
- **The thank-you holds:** thanks, their photos, their audience figures, and an invitation to write the talk up as an article or create a video for FOSTBeat. A feedback form comes in a later sprint.
- **Audience figures:** the talk's headcount, its share of everyone in a session at that time (for example 79 of 404 = 20%), and its share of the room's capacity. A count of 0 means not counted: the thank-you goes without figures.
- **Transcripts come from the existing pipeline that feeds beat.joinfost.io/pulse.** Recordings are cut into talks and named with the speaker and title by a separate process, usually two weeks after the event; n8n sends a copy of each transcript to the app's API, which matches it to the talk (suggesting, with the organiser confirming when unsure). Nothing is transcribed twice. Speakers consent through the AI consent form (change 7); anyone without consent recorded is flagged rather than sent.

### FOSTBeat hand-off (changes 3c and 13)

Agreed 12 Nov 2026.

- **Speakers can add a Bluesky profile** next to LinkedIn (change 3c). FOSTBeat's social channels are LinkedIn and Bluesky (no X), so both travel to the FOSTBeat author profile.
- **FOSTBeat runs on Strapi.** As elsewhere, the app announces (a speaker asks for an author profile; a transcript arrives) and n8n creates the author, the draft and the media-library uploads in Strapi, reporting the results (author id, profile and draft links) back to the app.
- **The draft is the transcript itself, never an AI rewrite.** FOSTBeat's AI use policy (business plan, section 7) allows AI only for transcription and sub-editing aids reviewed by a person; articles are written by people. The speaker writes the article from the draft.
- **Drafts appear in the FOSTBeat-me pipeline automatically**, because it lists every Strapi post whatever created it.
- **The thank-you's invitation to write an article or create a video** is the way in: speakers who accept become FOSTBeat creators (speaker share kits, speaker spotlights, "More from this creator").

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
| A CSV export of the existing Typeform consent forms (to map at build time) | 7 |
| Speaker card design and what it shows | 10a |
| Who may see a speaker's gender answer, and whether "Other" has a free-text box | 11 |
| How "program filled" is counted (accepted, or accepted and confirmed) against capacity | 11 |
| Strapi's creator (author) content type and fields, and whether speakers sign in to Strapi to edit their draft or send their text another way (the Strapi audit, BEAT-003, or Alexei) | 13 |
| Whether the FOSTBeat author profile is copied once or kept in step when the speaker updates their profile in the app | 13 |

# FOST Call for Speakers: automation map

Every automated workflow around the call for speakers app: who starts it, what the app announces, what n8n does, which outside systems are involved, what comes back to the app, and how far each one has got.

This file is the source for the automation map web page (published privately at https://claude.ai/artifact/7kgYU9dFrmj77WqPJAA1Le; share it from the page's Share menu). The page is generated from it by `docs/automation-map/build.mjs`, so change this file, then rebuild and republish the page. Keep the formats below (tables, `- **Field:** value` lines, and numbered `Who: what happens` steps) so the build can read it.

Rules every workflow follows (from `openspec/roadmap.md`):

- The app is the record. It announces what happens as signed events; n8n does the follow-up work and reports results back through the app's API.
- The app sends no email itself and has no direct link to Pipedrive, Soirée, Google Sheets or Strapi.
- Spreadsheets are windows onto the app. Where a sheet can change something, the change goes through the app.
- n8n workflows built against dev-cfp move to production by changing three settings: the app's address, the signing secret and the API key.

## Statuses

| Key | Label | Meaning |
| --- | --- | --- |
| live | Live on dev | Built in the app and in n8n, and working on dev-cfp with test data |
| ready | Event ready, n8n to build | The app already sends what n8n needs; the n8n workflow is still to build |
| planned | Planned | Needs a roadmap change first; the change number is given |
| question | Open question | Scope or a detail still to be decided before it can be planned |

## Stages

| Stage | What happens |
| --- | --- |
| Intake | Proposals and people arrive |
| Decisions | The committee reviews; organisers decide and tell speakers |
| Confirmation | Accepted speakers confirm, agree and register |
| Before the event | Program, slides and speaker materials |
| After the event | Photos, thanks, audience figures and transcripts |
| FOSTBeat | Speakers become FOSTBeat creators |
| Reporting | Numbers for organisers and management |

## Actors

| Actor | Who | Where they appear |
| --- | --- | --- |
| Speaker | Someone with an account who sends proposals | Every stage |
| Guest speaker | A speaker without a password yet (applied as a guest, or imported from Typeform) | Intake, until they claim their account |
| Reviewer | A program committee member for one or more conferences | Decisions |
| Organiser | FOST staff running conferences in the app | Every stage |
| MC | Hosts a stage for a block of the program; may also be a speaker | Before and after the event |
| Speaker-MC | A speaker who also MCs, and may share their own photos | After the event |
| Photographer | The event photographer, sharing photos in Google Drive | After the event |
| Mark | Runs Pipedrive, LinkedIn connections and CMO outreach | Intake, Decisions |
| Sales team | Sales team members copied on CMO outreach emails | Decisions |
| Partnership manager | Oversees the placement of every sponsor talk and workshop; sponsor sessions get no follow-up from the app | Decisions, Before the event |
| FOSTBeat editor | FOSTBeat's managing editor, working from the FOSTBeat-me dashboard | FOSTBeat |

## Systems

| System | Holds | Notes |
| --- | --- | --- |
| CFP app | People, proposals, reviews, decisions, agreements, the program, photo lists, transcripts | The record. Production at cfp.joinfost.io; dev-cfp.platformable.com is the test site |
| n8n | Nothing kept | Self-hosted. Receives signed events, calls outside systems, reports back to the app |
| Typeform | The old call for speakers form | Used until the mid-December cutover |
| Email | Letters sent by n8n | The FOST mailbox once emails go live |
| Soirée | Newsletter subscribers and tags | Keeps a "waitlisted" tag |
| Pipedrive | Mark's CRM: LinkedIn to-dos, CMO relationships | Uses only the existing "FOSTBeat CMO relationships" pipeline and `CMO …` fields |
| Overview sheet | One Google Sheet per conference: CFPs received, Speakers, Sponsors | A window onto the app; only the Decision column flows back |
| Program sheet | One Google Sheet per conference: day tabs, MC plan, track performance | Programs are made here, never in the app |
| Landscape database | API and AI vendors | Used to spot vendor speakers |
| Google Drive | Event photos from the photographer and MCs | Photos stay here; the app keeps a list with links |
| OVHcloud storage | Slides and photos speakers upload | 3 MB per photo, 6 MB per deck |
| Pulse pipeline | Talk transcripts behind beat.joinfost.io/pulse | Transcribes recordings already cut per talk |
| Strapi | FOSTBeat: creator profiles, articles, media library | Drafts appear in the FOSTBeat-me pipeline |

## Never leaves the app

- Gender answers (seen only by the speaker and organisers)
- Reviews, scores and the committee's comments
- Internal notes about proposals
- Phone numbers (organisers only)

## Workflows

### W01 · Typeform responses mirrored into the app
- **Stage:** Intake
- **Status:** live
- **Change:** 3b
- **Trigger:** A new Typeform response, until the mid-December cutover
- **Back to the app:** The new proposals, or "already imported"
- **Notes:** Silent: nobody is emailed and only Mark's branches react to proposal.imported

1. Speaker: Sends a proposal through the Typeform call for speakers
2. Typeform: Passes the response to n8n
3. n8n: Builds the request and calls the app's Typeform import
4. CFP app: Creates a guest and one proposal per mapped conference
5. CFP app: Lists any proposal without a matching topic as a topic exception
6. CFP app: Records proposal.imported

### W02 · Bulk import and claim emails at cutover
- **Stage:** Intake
- **Status:** live
- **Change:** 3b
- **Trigger:** An organiser uploads the Typeform export; later, presses "Email claim links"
- **Back to the app:** Nothing; the claim is recorded when the speaker sets a password
- **Notes:** Real data is imported only on production. Claim links last 30 days

1. Organiser: Uploads the Typeform CSV export and maps each conference column
2. CFP app: Imports guests and proposals in one go, emailing nobody
3. Organiser: At the cutover, presses "Email claim links"
4. CFP app: Issues a 30-day claim link for each imported guest
5. n8n: Writes the "your proposals have moved" email
6. Email: Delivers it to each imported speaker
7. Guest speaker: Sets a password and sees their proposals

### W03 · Guest submission and confirmation
- **Stage:** Intake
- **Status:** live
- **Change:** 3
- **Trigger:** Someone submits a proposal without an account
- **Back to the app:** The confirmation, when the guest clicks the link
- **Notes:** Unconfirmed proposals expire after 6 months

1. Guest speaker: Submits a proposal without an account
2. CFP app: Holds it unconfirmed and issues a confirmation link
3. n8n: Writes the confirmation email
4. Email: Delivers it
5. Guest speaker: Clicks the link
6. CFP app: The proposal now counts and proposal.submitted is recorded

### W04 · Password, invite and claim emails
- **Stage:** Intake
- **Status:** live
- **Change:** 2
- **Trigger:** "Forgot your password?", a committee invite, or a guest claiming their account
- **Back to the app:** The link is used once, then stops working
- **Notes:** While testing, n8n's TEST_ONLY list keeps every email to testers

1. Organiser: Invites a reviewer, or a speaker asks for a password link
2. CFP app: Issues a single-use link and records email_link.requested
3. n8n: Writes the email for that purpose
4. Email: Delivers it
5. Reviewer: Opens the link and sets a password

### W05 · Proposal receipt and newsletter
- **Stage:** Intake
- **Status:** ready
- **Change:** 1 (report back: 4)
- **Trigger:** proposal.submitted, one event per conference
- **Back to the app:** "Receipt sent" and "added to Soirée", once change 4 adds the report-back API
- **Notes:** Imported Typeform proposals do not trigger it

1. Speaker: Submits a proposal
2. CFP app: Records proposal.submitted
3. n8n: Sends the receipt email
4. Email: Delivers the receipt
5. n8n: Adds the speaker to Soirée
6. Soirée: The speaker joins the newsletter
7. CFP app: Records what was sent (change 4)

### W06 · LinkedIn to-dos for Mark
- **Stage:** Intake
- **Status:** ready
- **Change:** 1, 3b
- **Trigger:** proposal.submitted or proposal.imported
- **Back to the app:** Nothing
- **Notes:** LinkedIn connections cannot be automated, so this stays a to-do

1. Speaker: Submits a proposal, or is imported from Typeform
2. CFP app: Records proposal.submitted or proposal.imported
3. n8n: Creates a "connect on LinkedIn" activity
4. Pipedrive: To-dos for Mark's and the FOST LinkedIn accounts
5. Mark: Connects by hand

### W07 · Profile changes and MC interest
- **Stage:** Intake
- **Status:** ready
- **Change:** 1, 3b (MC tab: 4)
- **Trigger:** speaker.profile_updated, listing the changed fields
- **Back to the app:** Nothing
- **Notes:** Gender changes are never announced

1. Speaker: Updates their profile, or says yes to MCing
2. CFP app: Records speaker.profile_updated with the changed fields
3. n8n: Updates the speaker's row on each overview sheet
4. Overview sheet: The MC tab lists people open to MCing (change 4)
5. n8n: Starts the MC email thread
6. Email: Delivers it

### W08 · Overview sheet and committee decisions
- **Stage:** Decisions
- **Status:** planned
- **Change:** 4
- **Trigger:** Any proposal event; a Decision cell edited in the sheet
- **Back to the app:** The decision, saved or refused with a note
- **Notes:** Changing what a speaker has already been told must be done in the app

1. CFP app: Records every proposal event
2. n8n: Writes the CFPs received and Speakers tabs
3. Reviewer: Sets Yes, Waitlist or No in the Decision column
4. Overview sheet: Sends the change and the editor's email to n8n
5. n8n: Calls the app's decision API
6. CFP app: Saves the decision, or refuses it, and records proposal.decided
7. n8n: Writes the answer next to the cell

### W09 · Vendor and sponsor proposals
- **Stage:** Decisions
- **Status:** planned
- **Change:** 6
- **Trigger:** A proposal from a vendor's or confirmed sponsor's staff
- **Back to the app:** Vendors and sponsors kept up to date by n8n
- **Notes:** Several proposals from one vendor share one conversation

1. Landscape database: Lists API and AI vendors
2. n8n: Syncs vendors, and sponsors from the overview sheet, into the app
3. CFP app: Matches the speaker's organisation and waitlists with a reason
4. Partnership manager: Decides sponsor proposals by approving, offering a paid slot or rejecting
5. Organiser: Records the outcome in the app

### W10 · CMO outreach for vendor speakers
- **Stage:** Decisions
- **Status:** planned
- **Change:** 6
- **Trigger:** A vendor proposal waitlisted for a sponsorship conversation
- **Back to the app:** Nothing; the conversation lives in Pipedrive
- **Notes:** Respects "CMO opted out" and adds no new Pipedrive fields

1. CFP app: Waitlists a vendor proposal for a sponsorship conversation
2. n8n: Looks for the vendor's CMO in Pipedrive
3. Pipedrive: An email draft with the CMO in copy, or a "find the CMO" to-do
4. Mark: Gets one daily email of drafts to send and CMOs to find
5. Sales team: Copied when Mark sends the email

### W11 · Outcome letters in waves
- **Stage:** Decisions
- **Status:** planned
- **Change:** 5
- **Trigger:** Milestone reminders (T-3, T-2 and T-1 months); an organiser presses "Send outcomes"
- **Back to the app:** Each letter recorded as sent
- **Notes:** Only people whose situation changed are written to

1. CFP app: Reminds organisers at each milestone
2. Organiser: Presses "Send outcomes"
3. CFP app: Records a letter for each person whose situation changed
4. n8n: Writes the yes, waitlist and no letters
5. Email: Delivers them
6. Soirée: A "waitlisted" tag keeps waitlisted speakers in newsletter reminders
7. Overview sheet: The letter dates fill in

### W12 · Final review and freed slots
- **Stage:** Decisions
- **Status:** planned
- **Change:** 5
- **Trigger:** The T-1 milestone; a speaker cancelling
- **Back to the app:** Nothing
- **Notes:** A cancellation is the speaker's, so the decision stays yes

1. CFP app: At T-1, lists everything still waitlisted with its reason
2. n8n: Emails organisers the final-review alert
3. Speaker: Cancels, or an organiser records it for them
4. CFP app: Records the cancellation
5. n8n: Emails a "slot freed" alert with that conference's waitlist
6. Overview sheet: The row is marked "Cancelled by speaker"
7. Organiser: Fills the slot from the waitlist

### W13 · Confirmation and registration details
- **Stage:** Confirmation
- **Status:** ready
- **Change:** 1 (registration details: 5)
- **Trigger:** proposal.speaker_confirmed
- **Back to the app:** "Registration details sent" (change 4)
- **Notes:** Registration itself is ticked by hand until the ticketing system's API can be used

1. Speaker: Confirms their slot
2. CFP app: Records proposal.speaker_confirmed
3. n8n: Emails the conference's registration details
4. Email: Delivers them
5. Overview sheet: Shows attendance confirmed
6. Organiser: Ticks "registered" by hand once the speaker registers

### W14 · Code of conduct and AI consent
- **Stage:** Confirmation
- **Status:** planned
- **Change:** 7
- **Trigger:** The acceptance letter; then a daily check
- **Back to the app:** The agreement, with its date and version
- **Notes:** Never blocks confirming or getting registration details. The 41 existing consent forms are imported

1. CFP app: The acceptance letter asks for both agreements
2. Speaker: Agrees on their profile, or a guest uses an emailed link
3. n8n: Every 3 days, sends a reminder with a fresh link while either is missing
4. Email: Delivers the reminder
5. CFP app: Records the date and version, and flags a No to organisers

### W15 · Invited speakers
- **Stage:** Intake
- **Status:** question
- **Change:** 12
- **Trigger:** FOST invites a keynote or speaker outside the call
- **Back to the app:** To be explored
- **Notes:** To be explored before the end of December, for New York and Singapore outreach from mid January

1. Organiser: Invites a keynote or other speaker
2. CFP app: Adds them, as a guest if they have no account
3. n8n: Outreach emails, to be designed in change 12
4. Speaker: Joins the same journey as CFP speakers

### W16 · Slides and speaker cards
- **Stage:** Before the event
- **Status:** planned
- **Change:** 10a
- **Trigger:** An accepted speaker uploads their slides or photo
- **Back to the app:** Nothing
- **Notes:** The speaker card's design is still to be decided

1. Speaker: Uploads slides (up to 6 MB) and a photo (up to 3 MB)
2. OVHcloud storage: Keeps the files
3. CFP app: Links them to the talk and builds the speaker card
4. Organiser: Uses the card and slides for promotion and the event

### W17 · Program import
- **Stage:** Before the event
- **Status:** planned
- **Change:** 10b
- **Trigger:** An organiser imports the conference's program sheet
- **Back to the app:** The timetable, MCs and headcounts
- **Notes:** The app reads programs and never builds them

1. Program sheet: Holds the day tabs, MC plan and track performance
2. n8n: Sends the sheet's tabs to the app
3. CFP app: Matches talks by title and warns about errors in a preview
4. Organiser: Matches leftovers as a proposal, an invited speaker or a sponsor session
5. Partnership manager: Places sponsor talks and workshops, which the app skips
6. CFP app: Stores the timetable, MC slots, headcounts and room capacity

### W18 · Event photos
- **Stage:** After the event
- **Status:** planned
- **Change:** 10c
- **Trigger:** Photos arrive in the shared Drive folders
- **Back to the app:** The photo list with times and thumbnails
- **Notes:** No face recognition. Matching uses camera time and stage, or file order

1. Photographer: Shares 200 to 400 photos a day in a Drive folder
2. Speaker-MC: Shares phone photos in their own stage's folder
3. Google Drive: Keeps every photo
4. n8n: Lists each folder's files and sends the list to the app
5. CFP app: Matches photos to talks and MC slots by time and stage
6. Organiser: Confirms each burst of photos and approves MC photos
7. Speaker: Sees "your photos" and a link to the whole gallery

### W19 · Thank-yous with audience figures
- **Stage:** After the event
- **Status:** planned
- **Change:** 10d
- **Trigger:** An organiser sends thank-yous, within a few days of the event
- **Back to the app:** Each thank-you recorded as sent
- **Notes:** Sponsor sessions are thanked by the partnership managers, not the app. A count of 0 means no figures are sent

1. Organiser: Sends the thank-yous
2. CFP app: Adds each speaker's photos, headcount, share of the time slot and share of the room
3. n8n: Writes the thank-you with the FOSTBeat article or video invitation
4. Email: Delivers it
5. Speaker: Receives thanks, photos and audience figures
6. MC: Receives the same, for their stage

### W20 · Transcripts
- **Stage:** After the event
- **Status:** planned
- **Change:** 10d
- **Trigger:** A transcript is ready, usually two weeks after the event
- **Back to the app:** The transcript, matched to the talk
- **Notes:** The same transcripts power beat.joinfost.io/pulse; nothing is transcribed twice

1. Pulse pipeline: Transcribes each talk's recording
2. n8n: Sends a copy to the app
3. CFP app: Matches it to the talk and checks the speaker's AI consent
4. n8n: Emails "your transcript is ready"
5. Speaker: Reads it on their page and reports any mistakes

### W21 · FOSTBeat author hand-off
- **Stage:** FOSTBeat
- **Status:** planned
- **Change:** 13
- **Trigger:** A speaker asks for a FOSTBeat author profile; their transcript arrives
- **Back to the app:** The profile and draft links
- **Notes:** The draft is the transcript itself, never an AI rewrite

1. Speaker: Presses "Set up my FOSTBeat author profile"
2. n8n: Creates the creator profile from the speaker's profile
3. Strapi: Holds the headshot, bio, job title, LinkedIn and Bluesky
4. n8n: When the transcript arrives, creates a draft with their photos and slides
5. FOSTBeat editor: Sees the draft in the FOSTBeat-me pipeline
6. Speaker: Writes the article from the draft and publishes it

### W22 · Program dashboard and monthly reports
- **Stage:** Reporting
- **Status:** planned
- **Change:** 11 (monthly reports: later)
- **Trigger:** Always on; monthly reports at the end of each month
- **Back to the app:** Nothing
- **Notes:** Monthly counts per workflow stage need their own change, because event details are deleted after 30 days

1. CFP app: Counts program filled, consent done, slides uploaded and popular talks
2. Organiser: Reads the dashboard for each conference
3. CFP app: Later, counts how many pass through each workflow stage each month
4. Organiser: Shares the monthly report with management

## Open questions

| Question | Change |
| --- | --- |
| Monthly counts per workflow stage need counts kept beyond 30 days, because the app deletes event details after that | Later |
| Whether n8n can create Pipedrive mail drafts, or uses an activity with the text ready to copy | 6 |
| Where the landscape database lives and its column names | 6 |
| Speaker card design and what it shows | 10a |
| Whether a speaker who also MCs gets one combined thank-you or two | 10d |
| How invited speakers are brought in | 12 |
| Strapi's creator content type, and how speakers edit their draft | 13 |
| The production domain, cfp.joinfost.io, waits on its external owner. n8n workflows built on dev move by changing the app's address, signing secret and API key | Setup |

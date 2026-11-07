# Proposal

## Why

Speakers are applying for the 2027 conferences through Typeform today. The committee will review in the app from January 2027, and Typeform is switched off in mid-December. To get there:

- every 2027 CFP already collected needs to be in the app;
- every new Typeform response must be added as it arrives, so the app is a complete copy during the parallel run (see `openspec/roadmap.md`, "Intake and the move from Typeform");
- none of this may tell anyone anything until the cutover.

Typeform also asks speakers two things the app doesn't record yet: their gender, and whether they would be an MC. Both belong on the speaker's profile, so speakers who apply in the app can answer them too.

## What Changes

- **Bulk import from a Typeform export (CSV).** Organisers upload the file under Organise → Import and see a preview before anything is saved:
  - how many speakers and proposals will be created or skipped;
  - which conference each Typeform conference column maps to;
  - how many proposals will go on the topic exceptions list;
  - which countries or gender answers could not be matched.
- **Live sync through n8n.** A new `POST /api/v1/imports/typeform` endpoint takes one Typeform response, keyed by its response id. n8n's Typeform trigger calls it for each new response. The endpoint needs a read-write API key, and sending the same response twice adds nothing the second time.
- **One response becomes one proposal per conference ticked.** The title, abstract and level are copied to each, and the session format is *Talk (25 min)*.
- **Topics:**
  - The topic for each conference is the first ticked topic that is in that conference's topic list.
  - If none of the ticked topics is in the list, the proposal is still imported without a topic and goes on a **topic exceptions list** under Organise → Import. There an organiser picks one of the conference's topics, adds the speaker's topic to the conference's list, or leaves it without a topic.
- **Conference mapping.** The Typeform conference columns map to app conferences or to "skip". The mapping is set once in the preview and saved for the live sync. Only 2027 conferences are imported; the Paris 2026 and Cloud Native Summit Paris columns are skipped.
- **Speakers:**
  - Speakers are matched by email. A new email becomes a **guest** (speaker account without a password); an existing account keeps its details.
  - Imported proposals **already count**: speakers accepted Typeform's terms, so there's no confirmation step.
  - Name, job title, company, LinkedIn, country, gender and MC interest fill in an empty profile.
- **Two new optional profile fields for every speaker:**
  - **"What is your gender?"**: Female / Male / Prefer not to say / Other. Seen only by the speaker and organisers; never sent to n8n, the API or exports.
  - **"Would you be open to being an MC?"**: yes / no. Included in the speaker data that events and the API carry, as `mc_interest`, and in the speakers and submissions exports. n8n can then add MC candidates to an MC tab on the overview sheet and start an MC email thread.
- **Not imported:** sponsoring interest (sponsorship now comes from vendor outreach) and the APIMasters questions (not used in any process yet).
- **Silent by design:**
  - Imports record a new **`proposal.imported`** event, never `proposal.submitted` or `speaker.registered`. Only automations that choose `proposal.imported` react: the Pipedrive LinkedIn to-dos, and MC candidates.
  - Proposals keep their Typeform submission time.
- **Early (visa) approvals.** After importing, organisers mark those proposals accepted with the existing decision screen, ticking "The speaker was told before this app was used". `add-staged-decisions` turns that into "already told".
- **Claim-your-account emails for the cutover.** On the Import page, organisers can email every imported guest who hasn't claimed their account. Each email is a `claim_account` link valid for **30 days**, sent through n8n. People already sent one are skipped unless the organiser chooses to resend.

## Capabilities

### New Capabilities

- `proposals/imports`: bringing existing CFPs into the app.
  - the CSV import with preview;
  - the Typeform sync endpoint;
  - how a response maps to speakers and proposals;
  - conference mapping and the topic exceptions list;
  - silence during import;
  - the bulk claim-your-account emails.
- `accounts/speaker-profile`: the optional gender and MC-interest fields on a speaker's profile, and who can see each.

### Modified Capabilities

- `integrations/event-webhooks`: the event catalogue gains `proposal.imported`, and the speaker object in payloads gains `mc_interest`.
- `integrations/integration-api`: the first write endpoint, `POST /api/v1/imports/typeform`.

## Impact

- **Database:** migration `007_imports.sql`.
  - `users.gender` and `users.mc_interest`.
  - `proposals.source`, `source_ref` (the Typeform response id, unique per conference), `source_details` (terms accepted, the topics ticked, gender as written) and `topic_exception`.
  - `email_links.batch`.
  - An `import_batches` table and a `typeform_conference_map` setting.
- **Code:**
  - New `src/lib/imports.ts`.
  - Organise → Import page, with the exceptions list.
  - The API route.
  - Profile form fields.
  - Event catalogue and speaker payload.
  - Proposal page "Imported from Typeform" box for organisers.
  - Export columns.
  - A 30-day lifetime for bulk claim links.
- **Exports:** new last columns are added and existing columns don't change.
  - Submissions export: `source` and `speaker_mc_interest`.
  - Speakers export: `mc_interest`.
- **n8n:**
  - a Typeform trigger → HTTP Request workflow with a read-write key;
  - the LinkedIn to-do branch on `proposal.imported`;
  - an MC branch (overview sheet MC tab and email thread, built with `add-overview-sheet-sync`);
  - the claim email uses the existing `claim_account` wording.
- **Production:** the real import runs on the production site (cfp.joinfost.io), never on dev-cfp. Dev is tested with the fake sample file.

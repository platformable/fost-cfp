# Proposal

## Why

Speakers are applying for the 2027 conferences through Typeform today. The committee will review in the app from January 2027, and Typeform is switched off in mid-December. To get there:

- every 2027 CFP already collected needs to be in the app;
- every new Typeform response must be added as it arrives, so the app is a complete copy during the parallel run (see `openspec/roadmap.md`, "Intake and the move from Typeform");
- none of this may tell anyone anything until the cutover.

## What Changes

- **Bulk import from a Typeform export (CSV).** Organisers upload the file under Organise → Import and see a preview before anything is saved:
  - how many speakers and proposals will be created or skipped;
  - which conference each Typeform conference column maps to;
  - which topics, countries or genders could not be matched.
- **Live sync through n8n.** A new `POST /api/v1/imports/typeform` endpoint takes one Typeform response, keyed by its response id. n8n's Typeform trigger calls it for each new response. The endpoint needs a read-write API key, and sending the same response twice adds nothing the second time.
- **One response becomes one proposal per conference ticked.** The title, abstract and level are copied to each. The topic for each conference is the first ticked topic that exists in, or is added to, that conference's topic list. The session format is *Talk (25 min)*, which organisers can change.
- **Conference mapping.** The Typeform conference column headers map to app conferences. The mapping is set once in the preview and saved, so the live sync uses it too.
  - Columns mapped to "skip" are ignored, for example the Paris 2026 events (1 to 3 December) and Cloud Native Summit Paris. Only 2027 conferences are imported.
  - Topics named in a response that a mapped conference doesn't list are shown in the preview, and are added to that conference's topic list when the import is confirmed.
- **Speakers:**
  - Speakers are matched by email. A new email becomes a **guest** (speaker account without a password); an existing account keeps its details.
  - Imported proposals **already count**: speakers accepted Typeform's terms, so there's no confirmation step.
  - Name, job title, company, LinkedIn URL and country ("Where are you based?") fill in an empty profile.
- **The other Typeform answers are kept with each proposal** as "Typeform answers", shown to organisers on the proposal page and included in the submissions export as new last columns. These are:
  - gender (mapped to Female, Male, Prefer not to say or Other);
  - interested in sponsoring;
  - open to being an MC;
  - APIMasters instructor, and teaching topics;
  - the date the terms were accepted.
- **Silent by design:**
  - Imports record a new **`proposal.imported`** event, never `proposal.submitted` or `speaker.registered`. Only automations that choose `proposal.imported` react: the LinkedIn to-dos in Pipedrive.
  - Proposals keep their Typeform submission time.
- **Early (visa) approvals.** After importing, organisers mark those proposals accepted with the existing decision screen. A history note says the decision came before the app. Recording that the speaker was already told is added by `add-staged-decisions`.
- **Claim-your-account emails for the cutover.** On the Import page, organisers can email every imported guest who hasn't claimed their account yet. Each email is a `claim_account` link valid for **30 days**, sent through n8n with the usual `email_link.requested` event. People already sent one are skipped unless the organiser chooses to resend.

## Capabilities

### New Capabilities

- `proposals/imports`: bringing existing CFPs into the app.
  - the CSV import with preview;
  - the Typeform sync endpoint;
  - how a response maps to speakers and proposals;
  - conference mapping and new topics;
  - the stored Typeform answers;
  - silence during import;
  - the bulk claim-your-account emails.

### Modified Capabilities

- `integrations/event-webhooks`: the event catalogue gains `proposal.imported`.
- `integrations/integration-api`: the first write endpoint, `POST /api/v1/imports/typeform`.

## Impact

- **Database:** migration `007_imports.sql`.
  - Columns on `proposals`: `source` (`app`, `typeform_import` or `typeform_sync`), `source_ref` (the Typeform response id, unique per conference) and `source_answers` (JSONB).
  - A `typeform_conference_map` setting.
- **Code:**
  - New `src/lib/imports.ts`: parsing, mapping, preview, saving.
  - Organise → Import page.
  - The API route.
  - Event catalogue entry.
  - Proposal page block for organisers.
  - Submissions export columns.
  - A 30-day lifetime for bulk claim links.
- **Exports:** the submissions export gains `source` and `typeform_answers` as its last columns. Existing columns don't change.
- **n8n:**
  - a Typeform trigger → HTTP Request workflow with a read-write key;
  - the LinkedIn to-do branch moves to `proposal.imported`;
  - the claim email uses the existing `claim_account` wording.
- **Production:** the real import runs on the production site (cfp.joinfost.io), never on dev-cfp. Dev is tested with the fake sample file.

## Decisions taken in this proposal (please confirm)

1. **Only 2027 conferences are imported.** The Paris 2026 and Cloud Native Summit Paris columns are mapped to "skip".
2. **The session format defaults to Talk (25 min).**
3. **Extra Typeform answers are stored as structured "Typeform answers"** rather than in the speaker's own notes, so they stay separate and can be filtered and exported.
4. **Topics missing from a conference are added to its topic list when the import is confirmed**, after being listed in the preview.

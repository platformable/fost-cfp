# Design

## Context

See proposal.md for why, and `openspec/roadmap.md` ("Intake and the move from Typeform") for where this sits.

What the app already has:
- **Proposals:** created by `insertProposals()` inside a transaction. `submitProposals()` adds `proposal.submitted` events; guest submissions add none until confirmed.
- **Guests:** speaker rows with an empty `password_hash` (`src/lib/guests.ts`). Claim links (`claim_account`) come from `src/lib/email-links.ts` and currently last 7 days.
- **Events:** recorded with `recordProposalEvent()`.
- **The integration API** (`src/lib/api.ts`, `src/lib/api-v1.ts`): read routes only. Write methods with a read key get 403; with a read-write key they get 405.

The Typeform export (sample from Mark, two responses) is a **semicolon-separated CSV** with quoted, multi-line abstracts. Its first header is `#`, the response id. The columns are:

| Column group | What it holds |
|---|---|
| **Conference columns** | One per conference choice, between `#` and `Your first name`. A ticked cell holds the choice label, for example `apidays London 2027`. |
| **Speaker fields** | Name, gender, a gender `Other`, job title, company, email, "Where are you based?" (country names such as `France, Metropolitan`), LinkedIn URL |
| **Talk fields** | Title, abstract, level |
| **Topic columns** | One per topic choice, between the level column and the MC question, including a second `Other` |
| **Yes/no answers** | MC, APIMasters instructor and sponsoring, as `1`/`0`; plus teaching topics as free text. Only MC is imported. |
| **Terms** | The terms acceptance |
| **Metadata** | Response type, start and submit dates, network id, tags, ending |

## Goals / Non-Goals

**Goals:**
- A file import and a live sync that apply the same rules, so the app stays a complete copy of Typeform until cutover.
- Safe to run twice. A response is identified by its Typeform response id.
- Typeform question wording can change, and conference columns can be added, without code changes.

**Non-Goals:**
- Recording that early (visa) approvals were already told to the speaker. That arrives with `add-staged-decisions`. Until then, the decision is recorded with a history note.
- Updating a proposal when its Typeform response is edited later. Typeform responses are rarely edited, and the app becomes the place to edit at cutover.
- Importing from sources other than Typeform.

## Decisions

### 1. One normalised response, two ways in
Both the CSV parser and the API turn a response into the same object:

```
{ response_id, submitted_at, conferences: [choice label], topics: [choice label],
  first_name, last_name, email, job_title, company, linkedin, based_in,
  title, abstract, level,
  gender, gender_other, mc, terms_accepted }
```

One function, `importResponse(db, response, opts)`, applies every rule.

- The **CSV parser** finds columns by their position between known headers, so new conference or topic columns are picked up automatically. It reads the two `Other` columns by position, not by name.
- The **API** accepts the normalised object as JSON. n8n's Typeform trigger produces answers keyed by question title, so a short Set or Code node in n8n builds the object, and the README shows how.
- This keeps Typeform's question wording out of the app's API contract.
- *Alternative:* the API accepts Typeform's raw webhook body. Rejected because the app would then depend on Typeform's payload format and question wording.

### 2. CSV parsing without a new dependency
A small parser that handles quotes, doubled quotes and line breaks inside quotes. It works out the delimiter from the header line: `;` if there are more of those than `,`.

- The file is uploaded once and stored in a new `import_batches` row, with the text, who uploaded it, when, and the status.
- The preview page `/admin/import/<batch id>` parses it again. "Import" runs the batch.
- This avoids sending a large file through two form posts. Server actions are limited to 1 MB by default, and that limit is raised to 10 MB for this upload only.
- Batches keep a record of each import and its counts. Their text is cleared once imported.

### 3. Conference mapping in settings
The `typeform_conference_map` setting holds JSON: `{ "<choice label>": <conference id> | null }`, where `null` means skip.

- The preview shows every conference label found in the file, with a dropdown of app conferences plus "Skip". Labels with no saved mapping must be chosen before importing.
- The API uses the saved map. A response with an unmapped label imports the mapped conferences only, and its answer lists the unmapped labels. n8n's error branch can then alert Mark.

### 4. Idempotency
- `proposals.source_ref` holds the Typeform response id, with a unique index on `(source_ref, conference_id)` where `source_ref` is not null.
- `importResponse` takes an advisory lock on the response id, then returns `already_imported` if any proposal has that `source_ref`.
- A response that was imported for some conferences is not re-imported for conferences mapped later. Import is per response, and the preview says so.

### 5. Speakers
- The email is lowercased and matched against `users`. With no account, a guest is created (`role = 'speaker'`, `password_hash = ''`).
- For an existing account, only empty fields are filled: job title, organisation, LinkedIn, country, gender, MC interest.
- **Country:** "Where are you based?" is mapped to an ISO code using the app's country names plus a small alias list: `France, Metropolitan` → FR, `United States of America` → US, `UK` and `England` → GB. Unknown values are left empty and listed in the preview.
- **LinkedIn:** goes through the same `normalizeLinkedIn()` as the profile form. A value that isn't a LinkedIn URL is dropped and listed in the preview.

### 6. Proposals
- Inserted with `insertProposals()`:
  - `awaiting_confirmation = false`;
  - format `Talk (25 min)`;
  - level mapped to the app's levels, otherwise empty;
  - `submitted_at` set to the Typeform submit date in UTC.
- **Topic** for each conference: the first of the response's ticked topics (in column order) that is in that conference's topic list.
- **Kept with the proposal** in `source_details` (JSONB, organisers only): the response id, when the terms were accepted, the topics the speaker ticked, and the gender answer as written. These are shown in an "Imported from Typeform" box on the proposal page.
- **Not imported:** the sponsoring, APIMasters and teaching-topic columns are read past and dropped.

### 6a. Topic exceptions
- A proposal is an exception when its conference has a topic list and none of the speaker's ticked topics is on it. It is imported with an empty topic and `topic_exception = true`, and the ticked topics are kept in `source_details`.
- A conference with no topic list never produces exceptions; its proposals simply have no topic, as today.
- **Organise → Import → Topic exceptions** lists them by conference: speaker, title and ticked topics. For each, the organiser can:
  - pick one of the conference's topics;
  - add one of the ticked topics to the conference's topic list and use it;
  - accept "no topic".

  Each choice sets the topic, clears `topic_exception` and logs a history entry.
- The same list catches exceptions from the live sync, so nothing is held back while waiting for an organiser. The proposal is in the committee list without a topic until it is resolved.
- The preview shows how many exceptions an import would create, by conference.
- *Alternative:* adding missing topics to the conference automatically. Rejected because one speaker's "Travel Tech Day" tick would otherwise change a conference's topic list.

### 6b. Profile fields: gender and MC interest
- `users.gender` (`Female`, `Male`, `Prefer not to say`, `Other`, or empty) and `users.mc_interest` (true, false or empty) are added to the profile form under a "More about you (optional)" heading.
- **Gender:**
  - Shown to the speaker and organisers only: on the People page and on the committee proposal page when the viewer is an organiser.
  - Kept out of the speaker payload, the API, exports and `changed_fields`. Saving a profile where only gender changed records no event.
  - This is enforced in `payloads.ts` (which never selects it) and in `saveProfile()`, which leaves it out of the change list.
- **MC interest:**
  - Added to the speaker payload as `mc_interest`.
  - Added to the speakers export as `mc_interest` and the submissions export as `speaker_mc_interest`, both after the existing columns.
  - A change records `speaker.profile_updated` with `mc_interest` in `changed_fields`.
- **Gender mapping from Typeform:** trimmed and lowercased.

  | Typeform answer | Stored as |
  |---|---|
  | `female`, or within one typo of it (`fermale`) | Female |
  | `male` | Male |
  | `prefer not to say` | Prefer not to say |
  | `other`, or the gender `Other` column filled in | Other |
  | anything else | Other (and listed in the preview) |

  The answer as written is kept in `source_details`.
- **MC from Typeform:** `1` maps to true and `0` to false.

### 7. Events
- `proposal.imported` is added to the event catalogue. Like `email_link.requested`, existing endpoints only receive it once ticked.
- Its `data` is the usual `{ proposal }` plus `typeform: { response_id }`. The speaker object carries `account_status` (`guest` for new people) and `mc_interest`, and never gender.
- **MC candidates:** n8n reads `mc_interest` from `proposal.imported` and `speaker.profile_updated` to fill the overview sheet's MC tab and start the MC email thread. The sheet tab is built with `add-overview-sheet-sync`.
- No `proposal.submitted` or `speaker.registered` is recorded. At cutover, n8n can treat `proposal.imported` as the "received" record for the overview sheet.

### 8. The write endpoint
- `POST /api/v1/imports/typeform` goes through `apiRoute()`, so a read key gets 403 and a read-write key passes.
- The body is checked: it must have a response id and an email, and dates must be ISO.
- Answers:
  - `201 { proposals: [ids] }`
  - `200 { already_imported: true, proposals: [ids] }`
  - `200 { skipped: "no mapped conferences", unmapped: [labels] }`
- The other v1 routes keep answering 405 to writes.

### 9. Claim-your-account emails
- `issueLink()` gains an optional `lifetimeMs`. Bulk claim links use 30 days; the forgot-password claim link stays at 7 days.
- "Already emailed" means the guest has a link with `batch = 'import-claim'`. Migration 007 adds a nullable `email_links.batch` column, set only by the bulk action, so these links can be told apart from forgot-password and copied links.
  - *Alternative:* a history entry per proposal. Rejected because claiming is per person, not per proposal.
- The Import page shows how many guests will be emailed, then issues one link each, in batches of 50 per transaction.

### 10. Visa approvals
- Organisers use the existing decision screen.
- For proposals with `source <> 'app'`, the decision form shows a tick box: "The speaker was told before this app was used". Ticking it adds the history entry `decision told before import`.
- `add-staged-decisions` turns those entries into "already told".

## Risks / Trade-offs

- **[Real speaker data imported into the test site by mistake]** → The Import page shows the site's `BASE_URL` and asks the organiser to confirm it is production when the URL is not the production one. The README says to import on production only.
- **[A conference label is renamed in Typeform]** → It shows up as unmapped in the preview or in the API answer. Nothing is imported for it until it is mapped.
- **[One speaker ticks 12 conferences]** → That means 12 proposals with the same abstract. This is intended (each conference reviews separately). Same-speaker groups only apply to 2+ proposals at one conference.
- **[The bulk claim email goes to people who don't remember applying through "FOST"]** → The wording in n8n should name the conference and talk title. The payload has no proposals for `claim_account`, so the README suggests generic wording and links to the speaker's proposals after sign-in.
- **[Large files]** → The upload limit is 10 MB, and the preview reads the file in one pass. Hundreds of responses are well within that.

## Migration Plan

1. Migration `007_imports.sql` adds:
   - `users.gender` and `users.mc_interest`;
   - `proposals.source` (default `'app'`), `source_ref`, `source_details` and `topic_exception`, plus the partial unique index;
   - `email_links.batch`;
   - the `import_batches` table.

   It only adds things, so it is safe on a live database.
2. Deploy to dev and test with the fake sample file. Set up production, map the conferences, import the real export there, then switch on the n8n Typeform → API workflow on production.
3. **Rollback:** imported proposals can be removed with `DELETE FROM proposals WHERE source <> 'app'`, and guests left with nothing are then removed by the worker's clean-up. The profile columns can stay; older code ignores them.

## Data model

`table_` definitions are database rows; `payload_` definitions are API and event bodies. Existing definitions appear only for the parts this change touches. Nothing is removed.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://dev-cfp.platformable.com/schema/import-existing-proposals.json",
  "title": "import-existing-proposals data model",
  "$defs": {
    "table_users": {
      "description": "Existing table; other columns unchanged.",
      "type": "object",
      "properties": {
        "gender": { "type": ["string", "null"], "enum": ["Female", "Male", "Prefer not to say", "Other", null], "description": "NEW: optional; seen by the speaker and organisers only; never in payloads, the API or exports." },
        "mc_interest": { "type": ["boolean", "null"], "description": "NEW: optional; null when unanswered." }
      }
    },
    "table_proposals": {
      "description": "Existing table; other columns unchanged.",
      "type": "object",
      "properties": {
        "source": { "type": "string", "enum": ["app", "typeform_import", "typeform_sync"], "default": "app", "description": "NEW: where the proposal came from." },
        "source_ref": { "type": ["string", "null"], "description": "NEW: Typeform response id; unique per conference when set." },
        "source_details": { "oneOf": [{ "type": "null" }, { "$ref": "#/$defs/typeform_details" }], "description": "NEW: import details; organisers only." },
        "topic_exception": { "type": "boolean", "default": false, "description": "NEW: true while an imported proposal's topic needs an organiser to choose it." },
        "submitted_at": { "type": "string", "format": "date-time", "description": "For imports, the Typeform submit time." },
        "awaiting_confirmation": { "type": "boolean", "description": "Always false for imports." }
      },
      "required": ["source", "topic_exception"]
    },
    "typeform_details": {
      "description": "NEW: shape of proposals.source_details.",
      "type": "object",
      "properties": {
        "response_id": { "type": "string" },
        "terms_accepted_at": { "type": ["string", "null"], "format": "date-time" },
        "topics_ticked": { "type": "array", "items": { "type": "string" } },
        "gender_as_written": { "type": "string" }
      },
      "required": ["response_id", "topics_ticked"],
      "additionalProperties": false
    },
    "table_import_batches": {
      "description": "NEW: one uploaded file and its outcome.",
      "type": "object",
      "properties": {
        "id": { "type": "integer" },
        "filename": { "type": "string" },
        "content": { "type": ["string", "null"], "description": "The uploaded CSV; cleared once imported." },
        "status": { "type": "string", "enum": ["uploaded", "imported", "discarded"] },
        "counts": { "type": ["object", "null"], "description": "Speakers created or matched, proposals created, topic exceptions, responses skipped." },
        "created_by": { "type": ["integer", "null"] },
        "created_at": { "type": "string", "format": "date-time" },
        "imported_at": { "type": ["string", "null"], "format": "date-time" }
      },
      "required": ["id", "filename", "status", "created_at"],
      "additionalProperties": false
    },
    "table_email_links": {
      "description": "Existing table.",
      "type": "object",
      "properties": {
        "batch": { "type": ["string", "null"], "description": "NEW: 'import-claim' for links sent by the bulk claim action; null otherwise." }
      }
    },
    "setting_typeform_conference_map": {
      "description": "NEW settings key 'typeform_conference_map', stored as JSON text.",
      "type": "object",
      "additionalProperties": { "type": ["integer", "null"], "description": "Conference id, or null to skip that Typeform choice." }
    },
    "payload_typeform_response": {
      "description": "NEW: body of POST /api/v1/imports/typeform (and what the CSV parser produces for each row).",
      "type": "object",
      "properties": {
        "response_id": { "type": "string", "minLength": 1 },
        "submitted_at": { "type": "string", "format": "date-time" },
        "conferences": { "type": "array", "items": { "type": "string" }, "description": "Typeform conference choice labels ticked." },
        "topics": { "type": "array", "items": { "type": "string" } },
        "first_name": { "type": "string" },
        "last_name": { "type": "string" },
        "email": { "type": "string", "format": "email" },
        "job_title": { "type": "string" },
        "company": { "type": "string" },
        "linkedin": { "type": "string" },
        "based_in": { "type": "string" },
        "title": { "type": "string" },
        "abstract": { "type": "string" },
        "level": { "type": "string" },
        "gender": { "type": "string" },
        "gender_other": { "type": "string" },
        "mc": { "type": ["boolean", "null"] },
        "terms_accepted": { "type": "boolean" }
      },
      "required": ["response_id", "submitted_at", "conferences", "email", "title"],
      "additionalProperties": false
    },
    "payload_import_result": {
      "description": "NEW: answer of POST /api/v1/imports/typeform.",
      "type": "object",
      "properties": {
        "proposals": { "type": "array", "items": { "type": "integer" } },
        "topic_exceptions": { "type": "array", "items": { "type": "integer" }, "description": "Proposal ids that went on the topic exceptions list." },
        "already_imported": { "type": "boolean" },
        "skipped": { "type": "string", "enum": ["no mapped conferences"] },
        "unmapped": { "type": "array", "items": { "type": "string" } }
      },
      "additionalProperties": false
    },
    "payload_speaker": {
      "description": "Existing speaker object in events and API responses. CHANGED: adds mc_interest; gender is never included.",
      "type": "object",
      "properties": {
        "mc_interest": { "type": ["boolean", "null"], "description": "NEW" }
      },
      "required": ["mc_interest"]
    },
    "payload_event_proposal_imported": {
      "description": "NEW: data of a proposal.imported event. The proposal object is the existing payload_proposal (its speaker includes account_status and mc_interest).",
      "type": "object",
      "properties": {
        "proposal": { "type": "object", "description": "payload_proposal, unchanged apart from the speaker's mc_interest." },
        "typeform": {
          "type": "object",
          "properties": { "response_id": { "type": "string" } },
          "required": ["response_id"],
          "additionalProperties": false
        }
      },
      "required": ["proposal", "typeform"],
      "additionalProperties": false
    },
    "export_columns": {
      "description": "CHANGED: new columns after all existing ones; existing columns keep names and positions.",
      "type": "object",
      "properties": {
        "submissions.source": { "type": "string", "description": "NEW: app, typeform_import or typeform_sync." },
        "submissions.speaker_mc_interest": { "type": "string", "enum": ["yes", "no", ""], "description": "NEW" },
        "speakers.mc_interest": { "type": "string", "enum": ["yes", "no", ""], "description": "NEW (after account_status)." }
      }
    }
  }
}
```

The gender answer lives in `users.gender` and is shown only to the speaker and organisers. It is not in event payloads, `/api/v1/` or exports. The dashboard change decides whether totals by gender are shown, and to whom.

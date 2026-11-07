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
| **Yes/no answers** | MC, APIMasters instructor and sponsoring, as `1`/`0`; plus teaching topics as free text |
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
  gender, gender_other, mc, apimasters, teaching_topics, sponsoring, terms_accepted }
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
- For an existing account, only empty fields are filled: job title, organisation, LinkedIn, country.
- **Country:** "Where are you based?" is mapped to an ISO code using the app's country names plus a small alias list: `France, Metropolitan` → FR, `United States of America` → US, `UK` and `England` → GB. Unknown values are left empty and listed in the preview.
- **LinkedIn:** goes through the same `normalizeLinkedIn()` as the profile form. A value that isn't a LinkedIn URL is dropped and listed in the preview.

### 6. Proposals
- Inserted with `insertProposals()`:
  - `awaiting_confirmation = false`;
  - format `Talk (25 min)`;
  - level mapped to the app's levels, otherwise empty;
  - `submitted_at` set to the Typeform submit date in UTC.
- **Topic** for each conference: the first of the response's topics (in column order) that is in that conference's topic list after confirmation. The preview lists `(conference, topic)` pairs that are missing, and confirming adds them to the conference's topic list, in one transaction with the import.
- **Other answers:**
  - **Stored** in `source_answers` (JSONB): gender (mapped) and gender as written, MC, APIMasters, teaching topics, sponsoring, terms accepted and the response id.
  - **Shown** on the proposal page in an "Imported from Typeform" box, visible to organisers only.
  - **Exported** in the submissions export as two new last columns:
    - `source`;
    - `typeform_answers`, a readable summary such as `Gender: Female · Sponsoring: interested · MC: yes · APIMasters: no`.
  - **Not in events:** the gender answer never goes into event payloads or the API.
- **Gender mapping:** trimmed and lowercased.

  | Typeform answer | Stored as |
  |---|---|
  | `female`, or within one typo of it (`fermale`) | Female |
  | `male` | Male |
  | `prefer not to say` | Prefer not to say |
  | `other`, or the gender `Other` column filled in | Other |
  | anything else | Other (and listed in the preview) |

### 7. Events
- `proposal.imported` is added to the event catalogue. Like `email_link.requested`, existing endpoints only receive it once ticked.
- Its `data` is the usual `{ proposal }` plus `typeform: { response_id, sponsoring, mc, apimasters }`, with no gender. The speaker's `account_status` is `guest` for new people.
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
   - `proposals.source` (default `'app'`), `source_ref` and `source_answers`, plus the partial unique index;
   - `email_links.batch`;
   - the `import_batches` table.

   It only adds things, so it is safe on a live database.
2. Deploy to dev and test with the fake sample file. Set up production, map the conferences, import the real export there, then switch on the n8n Typeform → API workflow on production.
3. **Rollback:** imported proposals can be removed with `DELETE FROM proposals WHERE source <> 'app'`, and guests left with nothing are then removed by the worker's clean-up.

## Data model

`table_` definitions are database rows; `payload_` definitions are API and event bodies. Existing definitions appear only for the parts this change touches. Nothing is removed.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://dev-cfp.platformable.com/schema/import-existing-proposals.json",
  "title": "import-existing-proposals data model",
  "$defs": {
    "table_proposals": {
      "description": "Existing table; other columns unchanged.",
      "type": "object",
      "properties": {
        "source": { "type": "string", "enum": ["app", "typeform_import", "typeform_sync"], "default": "app", "description": "NEW: where the proposal came from." },
        "source_ref": { "type": ["string", "null"], "description": "NEW: Typeform response id; unique per conference when set." },
        "source_answers": { "oneOf": [{ "type": "null" }, { "$ref": "#/$defs/typeform_answers" }], "description": "NEW: other Typeform answers; organisers only." },
        "submitted_at": { "type": "string", "format": "date-time", "description": "For imports, the Typeform submit time." },
        "awaiting_confirmation": { "type": "boolean", "description": "Always false for imports." }
      },
      "required": ["source"]
    },
    "typeform_answers": {
      "description": "NEW: shape of proposals.source_answers.",
      "type": "object",
      "properties": {
        "response_id": { "type": "string" },
        "gender": { "type": ["string", "null"], "enum": ["Female", "Male", "Prefer not to say", "Other", null] },
        "gender_as_written": { "type": "string" },
        "mc": { "type": ["boolean", "null"] },
        "apimasters": { "type": ["boolean", "null"] },
        "teaching_topics": { "type": "string" },
        "sponsoring": { "type": ["boolean", "null"] },
        "terms_accepted_at": { "type": ["string", "null"], "format": "date-time" }
      },
      "required": ["response_id"],
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
        "counts": { "type": ["object", "null"], "description": "Speakers created or matched, proposals created, responses skipped." },
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
        "apimasters": { "type": ["boolean", "null"] },
        "teaching_topics": { "type": "string" },
        "sponsoring": { "type": ["boolean", "null"] },
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
        "already_imported": { "type": "boolean" },
        "skipped": { "type": "string", "enum": ["no mapped conferences"] },
        "unmapped": { "type": "array", "items": { "type": "string" } }
      },
      "additionalProperties": false
    },
    "payload_event_proposal_imported": {
      "description": "NEW: data of a proposal.imported event. The proposal object is the existing payload_proposal (its speaker includes account_status).",
      "type": "object",
      "properties": {
        "proposal": { "type": "object", "description": "payload_proposal, unchanged." },
        "typeform": {
          "type": "object",
          "properties": {
            "response_id": { "type": "string" },
            "sponsoring": { "type": ["boolean", "null"] },
            "mc": { "type": ["boolean", "null"] },
            "apimasters": { "type": ["boolean", "null"] }
          },
          "required": ["response_id"],
          "additionalProperties": false
        }
      },
      "required": ["proposal", "typeform"],
      "additionalProperties": false
    },
    "export_submissions_row": {
      "description": "submissions export. CHANGED: two new columns after all existing ones.",
      "type": "object",
      "properties": {
        "source": { "type": "string", "description": "NEW" },
        "typeform_answers": { "type": "string", "description": "NEW: readable summary, empty for proposals made in the app." }
      }
    }
  }
}
```

The gender answer is held only in `source_answers` and shown to organisers. It is not in event payloads or `/api/v1/`. The dashboard change decides who else may see it.

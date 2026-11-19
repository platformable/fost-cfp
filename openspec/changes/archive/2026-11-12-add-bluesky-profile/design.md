# Design

## Context

See proposal.md (Why). The LinkedIn profile is the pattern to follow, and today it:
- is one of `PROFILE_FIELDS` in `src/lib/users.ts`;
- is checked and normalised by `normalizeLinkedIn()` when the form is read (`readProfile`);
- is compared field by field in `saveProfile` to build `changed_fields`;
- is sent as `linkedin_profile_url` by `speakerPayload()` (`src/lib/payloads.ts`), which feeds both events and the integration API;
- appears in the speakers, submissions and program exports (`src/lib/export.ts`) and as a link on the committee proposal page.

The column is `users.linkedin_profile_url TEXT NOT NULL DEFAULT ''` (migration 001).

The `accounts/speaker-profile` capability is introduced by `import-existing-proposals`, which is built but not archived. This change adds requirements with different names to the same capability (see the spec), so either change can be archived first.

## Goals / Non-Goals

**Goals:**
- One stored form for every Bluesky value, so n8n, exports and links never have to clean it up.
- No change to any existing export column, payload field or event behaviour.

**Non-Goals:**
- Checking that the Bluesky account exists, or looking up its handle or display name (no network calls).
- Showing the Bluesky profile on the People page or anywhere besides the committee proposal page.

## Decisions

### 1. Store a full `https://bsky.app/profile/<handle>` address, not a bare handle
- **Why:** LinkedIn is stored as an address, exports are opened in sheets where an address is clickable, and n8n can pass it on unchanged. The handle is always the last part of the address, so automations that need the handle can take it from there.
- **Alternative considered:** storing the handle (`ada.bsky.social`). Every consumer would then have to build the address itself, and the column would differ in shape from `linkedin_profile_url`.

### 2. What `normalizeBluesky()` accepts, in `src/lib/users.ts` next to `normalizeLinkedIn()`
1. Trim, then remove one leading `@`.
2. If the value contains `bsky.app/profile/`, with or without `https://` or `www.`, take the part after `profile/` up to the next `/`, `?` or `#`. This turns a post link into its profile. A value with any other host is refused.
3. Lower-case the result and accept it if it is either:
   - **a handle** in Bluesky's handle format: two or more dot-separated parts of letters, digits and hyphens, each 1–63 characters, not starting or ending with a hyphen, the last part starting with a letter, and 253 characters at most in all (for example `ada.bsky.social` or `mark.platformable.com`);
   - **a `did:plc:` or `did:web:` identifier**, which Bluesky uses in profile addresses when someone links by account id. Both kinds are lower case by definition, so lower-casing doesn't change a valid one.
4. Return `https://bsky.app/profile/<value>`, or null if it is not accepted. `readProfile` turns null into the error message given in the spec.
- **Why this format check:** it is the published handle syntax. It refuses a single word ("ada"), which is never a valid handle, and catches typos like spaces, without a network call.
- **Alternative considered:** resolving the handle through Bluesky's public API to confirm the account. That adds a network dependency to saving a profile, fails when Bluesky is slow, and isn't needed for promotion links.

### 3. Add `bluesky_profile_url` to the end of `PROFILE_FIELDS`
The profile form, the save, the "changed" comparison and the redisplay after an error all loop over `PROFILE_FIELDS`, so adding it there gives the same behaviour as LinkedIn for free:
- `changed_fields` lists `bluesky_profile_url`;
- an unchanged save writes nothing.

Putting it last keeps the order of the existing `changed_fields` entries.

### 4. Payloads and exports: add after, never in between
- **Payloads:** `SpeakerPayload` gains `bluesky_profile_url: string | null` (`orNull`, like LinkedIn), and `SPEAKER_COLUMNS` gains the column. JSON consumers read fields by name, so its place in the object doesn't matter. It is written next to `linkedin_profile_url` for readability.
- **Exports:** `speakers` gets `bluesky_profile_url` after `mc_interest`; `submissions` gets `speaker_bluesky_profile_url` after `speaker_mc_interest`; `program` gets it after `updated_at`. These are the current last columns, so existing sheets that read by position keep working (the same rule used for `account_status` and `mc_interest`).

### 5. Profile form placement and wording
The field goes directly under "LinkedIn profile URL", labelled "Bluesky profile" with "optional" and the placeholder `@name.bsky.social`. It uses `inputMode="url"`, `autoCapitalize="none"` and `spellCheck={false}` so phone keyboards don't capitalise handles.

## Data model

New column: `users.bluesky_profile_url`. Changed objects: the speaker payload (events and API), the `changed_fields` values of `speaker.profile_updated`, and one row of each of the speakers, submissions and program exports. Nothing is removed.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cfp.joinfost.io/schemas/add-bluesky-profile.json",
  "title": "add-bluesky-profile data model",
  "$defs": {
    "blueskyProfileUrl": {
      "type": "string",
      "format": "uri",
      "pattern": "^https://bsky\\.app/profile/([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$|^https://bsky\\.app/profile/did:(plc|web):[A-Za-z0-9._:%-]+$",
      "description": "NEW: A Bluesky profile address in the one stored form: https://bsky.app/profile/<lower-case handle or did>."
    },
    "table_users": {
      "description": "Existing table; only the new column is shown.",
      "type": "object",
      "properties": {
        "bluesky_profile_url": {
          "description": "NEW: TEXT NOT NULL DEFAULT ''. Empty string when the speaker has none, otherwise a blueskyProfileUrl.",
          "anyOf": [{ "const": "" }, { "$ref": "#/$defs/blueskyProfileUrl" }]
        }
      },
      "required": ["bluesky_profile_url"]
    },
    "speaker_payload": {
      "description": "CHANGED: the speaker object in event payloads (data.speaker, data.proposal.speaker) and in GET /api/v1/speakers/{id}. Existing properties are unchanged and not repeated here.",
      "type": "object",
      "properties": {
        "linkedin_profile_url": { "type": ["string", "null"], "format": "uri", "description": "Unchanged; shown for position." },
        "bluesky_profile_url": {
          "description": "NEW: the stored address, or null when the speaker has none.",
          "anyOf": [{ "type": "null" }, { "$ref": "#/$defs/blueskyProfileUrl" }]
        }
      },
      "required": ["bluesky_profile_url"]
    },
    "speaker_profile_updated_data": {
      "description": "CHANGED: data of a speaker.profile_updated event.",
      "type": "object",
      "properties": {
        "changed_fields": {
          "type": "array",
          "items": {
            "enum": ["first_name", "last_name", "organization", "job_title", "bio", "linkedin_profile_url", "phone", "country", "photo_url", "bluesky_profile_url", "mc_interest"],
            "description": "CHANGED: may now include bluesky_profile_url. Never includes gender."
          }
        },
        "speaker": { "$ref": "#/$defs/speaker_payload" }
      },
      "required": ["changed_fields", "speaker"]
    },
    "export_speakers_row": {
      "description": "CHANGED: one row of the speakers export; existing columns unchanged and not repeated.",
      "type": "object",
      "properties": {
        "mc_interest": { "enum": ["yes", "no", ""], "description": "Unchanged; the previous last column." },
        "bluesky_profile_url": { "type": "string", "description": "NEW: last column; the stored address or empty." }
      }
    },
    "export_submissions_row": {
      "description": "CHANGED: one row of the submissions export; existing columns unchanged and not repeated.",
      "type": "object",
      "properties": {
        "speaker_mc_interest": { "enum": ["yes", "no", ""], "description": "Unchanged; the previous last column." },
        "speaker_bluesky_profile_url": { "type": "string", "description": "NEW: last column; the speaker's stored address or empty." }
      }
    },
    "export_program_row": {
      "description": "CHANGED: one row of the program export; existing columns unchanged and not repeated.",
      "type": "object",
      "properties": {
        "updated_at": { "type": "string", "format": "date-time", "description": "Unchanged; the previous last column." },
        "speaker_bluesky_profile_url": { "type": "string", "description": "NEW: last column; the speaker's stored address or empty." }
      }
    }
  }
}
```

## Risks / Trade-offs

- **[A speaker types a valid-looking handle for an account that doesn't exist]** → The link leads to Bluesky's "profile not found" page. This is accepted, the same as a mistyped LinkedIn address today. Organisers can see the link on the committee page.
- **[Handles change]** → Bluesky lets people change their handle, which breaks a stored handle address, while a `did:` address keeps working. Speakers can update the field. Storing DIDs would need a network lookup (a non-goal).
- **[Every form that saves a profile must include the field]** → `readProfile` reads every `PROFILE_FIELDS` entry, so a form without the field would clear it. Only the profile form saves profiles today. The task list checks the import path, which writes users directly and doesn't touch the column.
- **[Sheets that read exports by column position]** → Protected by adding only last columns (decision 4). The pinned-header tests are updated to assert it.

## Migration Plan

1. Migration `008_bluesky_profile.sql`: `ALTER TABLE users ADD COLUMN bluesky_profile_url TEXT NOT NULL DEFAULT '';`. Existing rows get an empty value. It applies on start-up like the others.
2. Deploy. No backfill is needed.
3. In n8n, nothing breaks: the new field is extra. The README notes it for anyone building Bluesky steps.
4. Rollback: redeploy the previous version. The extra column is ignored by old code; drop it only if the change is abandoned.

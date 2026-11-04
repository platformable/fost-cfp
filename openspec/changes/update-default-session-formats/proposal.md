# Update the default session formats

## Why

FOST's conferences now run four session formats: Talk, Panel and Q&A Onstage at 25 minutes each, and Workshop at 50 minutes. The app still offers the original placeholder list (Talk 30, Lightning talk 10, Workshop 90, Panel 45). Every conference listed is for next year, so all of them should switch now, before more proposals arrive.

## What Changes

- The default session formats become: Talk (25 min), Panel (25 min), Q&A Onstage (25 min), Workshop (50 min).
- A migration writes this list into every existing conference, replacing any formats an organiser had typed in. Organisers can still edit a conference's formats afterwards.
- New conferences with a blank formats box use the new defaults, and the box shows them as its placeholder.
- Proposals keep the format they were submitted with (for example "Talk (30 min)"). A speaker editing such a proposal can keep it or pick a new format. Nothing is relabelled automatically.
- The integration-events change moves its migration from 003 to 004.

No export columns are added, renamed or removed. The `formats` value in the conferences export and the `format` value in the submissions export change for the reasons above.

## Capabilities

### New Capabilities
- `conferences/session-formats`: the default list of session formats and how existing conferences and proposals are treated when it changes.

## Impact

- `db/migrations/003_new_default_session_formats.sql` (new), applied when the app starts.
- `src/lib/formats.ts` (new), `src/lib/conferences.ts`, `src/app/admin/conferences/ConferenceForm.tsx`.
- Demo data and tests use "Talk (25 min)".

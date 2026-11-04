# Proposal

## Why

FOST wants to open calls for proposals now for conferences from June onwards, while only the month is known. Today a conference's dates must be exact days or left blank. Leaving them blank hides all timing from speakers, puts the conference at the bottom of every list, and gives no edit deadline, so organisers cannot honestly say "June 2027". This is the first change on the roadmap (`openspec/roadmap.md`) because calls need to open now and nothing else depends on it.

## What Changes

- Organisers can set a conference's dates as **month only** (month and year) or as **exact dates** (start and end days), and switch from month only to exact dates at any time. The call for proposals can open and close on exact dates either way.
- Everywhere a conference's dates appear (home page, conference page, proposal form, speaker and committee pages, organiser dashboard), a month-only conference shows as, for example, "June 2027".
- Conferences with month-only dates sort by that month, alongside conferences with exact dates, instead of falling to the bottom.
- While a conference has month-only dates, speakers can keep editing, and their proposals show "Edit deadline set once dates are confirmed" instead of a countdown. Once exact dates are entered, the usual deadline (the day before the conference starts) applies.
- The conferences spreadsheet export gains two columns **added at the end**: `date_precision` (`day` or `month`) and `dates_display` (for example, "June 2027"). Existing columns keep their names and positions. For a month-only conference, `start_date` holds the first day of the month and `end_date` is empty, so automations that read `start_date` must check `date_precision`.

## Capabilities

### New Capabilities

- `conferences/conference-dates`: how a conference's dates are entered, stored with their precision, shown, sorted and exported, and how their precision affects the speaker edit deadline.

### Modified Capabilities

None. No specs exist yet for the current behaviour.

## Impact

- **Database:** a new migration adds `date_precision` to `conferences` (existing rows become `day`), with a check that a month-only conference has its start on the first of the month and no end date.
- **Code:** conference form and validation (`src/app/admin/conferences/ConferenceForm.tsx`, `src/lib/conferences.ts`), date display (`src/lib/format.ts` and the pages that show conference dates), the edit deadline (`src/lib/proposals.ts`), the conferences export (`src/lib/export.ts`) and the demo data (`scripts/seed.ts`).
- **Exports:** two columns appended to the conferences export; no columns renamed, removed or moved.
- **Later changes:** `add-integration-events` already carries `date_precision` in its conference payload; with this change in place it will send `month` where it applies. That change's migration takes the next number after this one.

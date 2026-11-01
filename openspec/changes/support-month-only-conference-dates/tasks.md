# Tasks

## 1. Schema and rules

- [x] 1.1 Add `db/migrations/002_conference_date_precision.sql` adding `date_precision` (`day` or `month`, default `day`) with a check that month-only rows start on the 1st and have no end date; verify it applies to a copy of the seeded database, existing rows read as `day`, and inserting a mid-month month-only row fails
- [x] 1.2 Update conference reading, validation and saving in `src/lib/conferences.ts`: accept `date_precision`, `start_month` and `start_year`, store month-only dates as `YYYY-MM-01` with no end date, require a month and year when "Month only" is chosen, and refuse a call closing date after the end of the conference month; verify with integration tests for creating month-only, switching to exact, and both validation errors

## 2. Showing and sorting dates

- [x] 2.1 Add `conferenceDates(conf)` in `src/lib/format.ts` and use it on the home page, conference page, proposal form details, committee and organiser pages instead of `dateRange()`; verify with unit tests ("June 2027", exact ranges unchanged, empty with no dates) and in the browser that each page shows "June 2027" for a month-only conference
- [x] 2.2 Verify with an integration test that a list containing 20 May 2027 (exact), June 2027 (month only), 3 June 2027 (exact) and a conference with no dates is ordered in that sequence, with the undated conference last

## 3. Organiser form

- [x] 3.1 Add the "Exact dates / Month only" choice to `ConferenceForm.tsx`, with month and year drop-downs (this year to five years ahead) for month only and the existing date inputs for exact dates, keeping the chosen month as a hint when switching; verify in the browser that an organiser can create a month-only conference, then confirm exact dates later, with copy in plain British English

## 4. Edit deadline

- [x] 4.1 Make `editDeadline()` return no deadline for month-only conferences and add the "Edit deadline set once dates are confirmed" case to `editWindow()`; verify with unit tests, and with an integration test that saving exact dates afterwards produces the usual "N days left to edit" label

## 5. Exports and demo data

- [x] 5.1 Append `date_precision` and `dates_display` to the conferences export after `talks_confirmed`; verify with an integration test that a month-only conference exports `2027-06-01`, an empty `end_date`, `month` and "June 2027", that the first 16 column names and positions are unchanged, and that an undated conference has an empty `date_precision`
- [x] 5.2 Add a month-only conference to `scripts/seed.ts` and mention month-only dates in the README's organiser notes; verify `npm run db:seed` on an empty database shows it as "June …" on the home page

## 6. Final check

- [x] 6.1 Run `npm run typecheck`, `npm test` and a production build, then walk through in the browser: create a month-only conference, submit a proposal to it, see "Edit deadline set once dates are confirmed", confirm exact dates as organiser, and see the countdown appear

## Workflow follow-up

- Archive the change with `/opsx:archive` once it has shipped, so `conferences/conference-dates` joins the project's specs.
- Renumber the `add-integration-events` migration to follow this one (already noted in that change's design).

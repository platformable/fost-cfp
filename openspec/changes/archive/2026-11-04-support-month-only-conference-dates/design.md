# Design

## Context

See proposal.md for why. Conferences store `start_date` and `end_date` as PostgreSQL `DATE` columns, entered with `<input type="date">`. Dates are shown through `dateRange()` in `src/lib/format.ts`, lists sort with `ORDER BY start_date … NULLS LAST`, and the edit deadline in `src/lib/proposals.ts` is the day before `start_date`. The conferences export lists its columns in a fixed order that outside automations may rely on.

## Goals / Non-Goals

**Goals:**
- Keep one date column to sort and filter on, so lists, exports and later milestone calculations keep working without special cases.
- Make it impossible to store a month-only conference that looks like an exact one.

**Non-Goals:**
- Month-only call opening or closing dates: the call always opens and closes on real days.
- Other partial precisions (season, quarter, year only).
- Notifying speakers when exact dates are confirmed. That is n8n's job once `add-integration-events` ships.

## Decisions

### 1. Store a precision flag next to the existing dates
Add `date_precision` (`day` or `month`) to `conferences`. A month-only conference stores the first of the month in `start_date` and leaves `end_date` empty. A database check enforces that shape.
- *Why:* sorting, `NULLS LAST`, export filters and later milestone maths keep using one real `DATE` column, and the first of the month naturally sorts before exact days in that month, as the spec requires.
- *Alternative:* separate `start_month` and `start_year` columns. Rejected: two sources of truth, and every query that orders or compares dates would need a `COALESCE`.
- *Alternative:* storing `'2027-06'` as text. Rejected: loses the `DATE` type and breaks ordering against exact dates.

### 2. Month and year as two drop-downs
The form shows a choice of "Exact dates" or "Month only". "Month only" shows a month drop-down (January to December) and a year drop-down (this year to five years ahead). The server turns them into `start_date = YYYY-MM-01`.
- *Why:* `<input type="month">` is not supported in every browser organisers use, such as desktop Safari, where it falls back to a free-text box.
- Switching to "Exact dates" keeps the month as a hint (for example, by pre-filling the first of the month) so the organiser only adjusts the day.

### 3. One display function for conference dates
Replace the `dateRange(start, end)` calls with `conferenceDates(conf)`. It returns "June 2027" for month precision (English month name, UTC), the existing range text for exact dates, and an empty string when there are no dates. The same function feeds the export's `dates_display`, so the site and spreadsheets always agree.

### 4. Edit deadline
`editDeadline()` returns no deadline when the precision is `month`. `editWindow()` gains a case before "No edit deadline" that labels these proposals "Edit deadline set once dates are confirmed", in the open tone. The rule that hidden decisions never lock a speaker out is unchanged.

### 5. Export columns appended
`date_precision` and `dates_display` are added after `talks_confirmed`, the current last column. `date_precision` is `''` when `start_date` is empty, so "no dates" is not reported as `day`.

### 6. Demo data
`scripts/seed.ts` adds a third conference with month-only dates, so the feature is visible in a fresh demo.

## Data model

`conferences` gains `date_precision`; the meaning of `start_date` and `end_date` for month-only conferences is described below. The conferences export gains two columns at the end. Nothing is removed. Prefixes: `table_` for database rows, `export_` for spreadsheet rows, `form_` for what the organiser form posts.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://fost-rego/schemas/support-month-only-conference-dates.json",
  "title": "support-month-only-conference-dates data model",
  "description": "The conferences table (changed) and the conferences export row (changed). Nothing is removed.",
  "$defs": {
    "table_conferences": {
      "description": "CHANGED: gains date_precision. Other columns unchanged.",
      "type": "object",
      "properties": {
        "id": { "type": "integer" },
        "name": { "type": "string", "minLength": 1 },
        "slug": { "type": "string" },
        "description": { "type": "string" },
        "location": { "type": "string" },
        "website": { "type": "string" },
        "start_date": { "type": ["string", "null"], "format": "date", "description": "CHANGED: for month-only conferences, the first day of the month (e.g. 2027-06-01); for exact dates, the first conference day; null when no dates." },
        "end_date": { "type": ["string", "null"], "format": "date", "description": "CHANGED: always null for month-only conferences." },
        "date_precision": { "type": "string", "enum": ["day", "month"], "default": "day", "description": "NEW: 'month' means only the month and year of start_date are known. Existing rows become 'day'. Ignored when start_date is null." },
        "cfp_opens": { "type": ["string", "null"], "format": "date" },
        "cfp_closes": { "type": ["string", "null"], "format": "date" },
        "topics": { "type": "string" },
        "formats": { "type": "string" },
        "blind_review": { "type": "boolean" },
        "decisions_published": { "type": "boolean" },
        "archived": { "type": "boolean" },
        "created_at": { "type": "string", "format": "date-time" },
        "updated_at": { "type": "string", "format": "date-time" }
      },
      "required": ["id", "name", "slug", "date_precision", "blind_review", "decisions_published", "archived"],
      "allOf": [
        {
          "description": "NEW: database check. A month-only conference starts on the first of a month and has no end date.",
          "if": { "properties": { "date_precision": { "const": "month" } }, "required": ["date_precision"] },
          "then": {
            "properties": {
              "start_date": { "type": "string", "pattern": "^\\d{4}-\\d{2}-01$" },
              "end_date": { "type": "null" }
            },
            "required": ["start_date"]
          }
        }
      ]
    },
    "export_conferences_row": {
      "description": "CHANGED: one row of the conferences export (CSV, XLSX, JSON). Two columns appended at the end; existing columns keep their names and order.",
      "type": "object",
      "properties": {
        "conference_id": { "type": "integer" },
        "name": { "type": "string" },
        "slug": { "type": "string" },
        "location": { "type": "string" },
        "website": { "type": "string" },
        "start_date": { "type": "string", "description": "CHANGED: 'YYYY-MM-DD', the first of the month for month-only conferences, '' when no dates." },
        "end_date": { "type": "string", "description": "CHANGED: '' for month-only conferences." },
        "cfp_opens": { "type": "string" },
        "cfp_closes": { "type": "string" },
        "topics": { "type": "string" },
        "blind_review": { "type": "string", "enum": ["yes", "no"] },
        "decisions_published": { "type": "string", "enum": ["yes", "no"] },
        "archived": { "type": "string", "enum": ["yes", "no"] },
        "proposals_total": { "type": "integer" },
        "proposals_accepted": { "type": "integer" },
        "talks_confirmed": { "type": "integer" },
        "date_precision": { "type": "string", "enum": ["day", "month", ""], "description": "NEW: last-but-one column. '' when the conference has no dates." },
        "dates_display": { "type": "string", "description": "NEW: last column. The dates as shown on the site, e.g. 'June 2027' or '10 Jun 2027 – 11 Jun 2027'; '' when no dates." }
      },
      "required": ["conference_id", "name", "slug", "location", "website", "start_date", "end_date", "cfp_opens", "cfp_closes", "topics", "blind_review", "decisions_published", "archived", "proposals_total", "proposals_accepted", "talks_confirmed", "date_precision", "dates_display"],
      "additionalProperties": false
    },
    "form_conference_dates": {
      "description": "NEW: the date fields the conference form posts.",
      "type": "object",
      "properties": {
        "date_precision": { "type": "string", "enum": ["day", "month"] },
        "start_date": { "type": "string", "description": "Exact dates only: 'YYYY-MM-DD' or ''." },
        "end_date": { "type": "string", "description": "Exact dates only: 'YYYY-MM-DD' or ''." },
        "start_month": { "type": "string", "pattern": "^(|[1-9]|1[0-2])$", "description": "Month only: 1–12." },
        "start_year": { "type": "string", "pattern": "^(|\\d{4})$", "description": "Month only: four-digit year." }
      },
      "required": ["date_precision"]
    }
  }
}
```

## Risks / Trade-offs

- [An automation reads `start_date` as an exact day for a month-only conference] → `date_precision` sits in the same export row and the proposal calls it out; `add-integration-events` payloads carry the same flag.
- [An organiser forgets to confirm exact dates, so speakers never get an edit deadline] → The organiser dashboard shows "Month only" against the conference's dates, and `add-staged-decisions` will prompt for exact dates when milestones approach.
- [Code elsewhere uses `start_date` as an exact day] → Every current use was reviewed (display, sorting, edit deadline, export). Integration tests cover each one, and later changes (milestones) must check the precision; the spec states the rule.

## Migration Plan

1. Migration `002_conference_date_precision.sql`: add `date_precision TEXT NOT NULL DEFAULT 'day'` with checks on the allowed values and the month-only shape. Existing rows become `day`, so nothing changes for them. It runs automatically at start-up.
2. Rollback: deploy the previous version first, so no month-only conferences are created, then drop the column. A month-only conference left behind would show as an exact date on the 1st of the month, so convert any to exact dates before rolling back.

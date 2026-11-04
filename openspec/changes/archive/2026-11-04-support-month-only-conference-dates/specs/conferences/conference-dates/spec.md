# Spec Delta

## Purpose

Defines how a conference's dates are recorded when only the month is known or when exact days are known, and how that precision shows up for speakers, committees, organisers, sorting, the edit deadline and exports.

## ADDED Requirements

### Requirement: Organisers choose the precision of conference dates
When creating or editing a conference, organisers SHALL choose between "Exact dates" (a start day and an optional end day) and "Month only" (a month and year), or leave the dates out. The call for proposals opening and closing dates SHALL remain exact days in every case.

#### Scenario: Create a conference with only the month
- **WHEN** an organiser creates a conference, chooses "Month only" and enters June 2027
- **THEN** the conference is saved with month-only dates for June 2027 and its call can open immediately

#### Scenario: Confirm exact dates later
- **WHEN** an organiser edits that conference, chooses "Exact dates" and enters 10 to 11 June 2027
- **THEN** the conference is saved with exact dates and no longer shows as month only

#### Scenario: No dates yet
- **WHEN** an organiser leaves the conference dates out
- **THEN** the conference is saved without dates, as today

### Requirement: Month-only dates are validated
A month-only date SHALL be a real month and year. When the call's closing date is set, it SHALL NOT fall after the last day of the conference month. Exact dates SHALL keep today's rule that the end is not before the start.

#### Scenario: Call closes after the conference month
- **WHEN** an organiser sets month-only dates of June 2027 and a call closing date of 5 July 2027
- **THEN** the conference is not saved and the organiser is told the call must close before the end of the conference month

#### Scenario: Missing month
- **WHEN** an organiser chooses "Month only" but enters no month
- **THEN** the conference is not saved and the organiser is asked to choose the month and year

### Requirement: Month-only dates are shown as a month
Wherever conference dates are shown to speakers, committee members or organisers, a month-only conference SHALL be shown as the month name and year (for example, "June 2027") and SHALL NOT show a specific day.

#### Scenario: Home page
- **WHEN** a visitor views the home page and a conference has month-only dates for June 2027
- **THEN** its card shows "June 2027"

#### Scenario: Proposal form
- **WHEN** a speaker picks that conference on the proposal form
- **THEN** the conference's details show "June 2027"

### Requirement: Month-only conferences sort by their month
Lists of conferences ordered by date SHALL place a month-only conference at the start of its month, among conferences with exact dates. Conferences with no dates SHALL still come last.

#### Scenario: Mixed list
- **WHEN** conferences dated 20 May 2027 (exact), June 2027 (month only) and 3 June 2027 (exact) are listed in date order
- **THEN** they appear as 20 May 2027, June 2027, 3 June 2027

### Requirement: Edit deadline waits for exact dates
While a conference has month-only dates, speakers SHALL be able to edit their proposals for it, subject to the existing rules that do not depend on dates, and their proposals SHALL show "Edit deadline set once dates are confirmed". When exact dates are saved, the last editing day SHALL become the day before the conference starts.

#### Scenario: Month only
- **WHEN** a speaker views a proposal for a conference with month-only dates
- **THEN** it shows "Edit deadline set once dates are confirmed" and the speaker can edit it

#### Scenario: Exact dates confirmed
- **WHEN** an organiser sets the conference's exact start date to 10 June 2027
- **THEN** the speaker's proposal shows the days left to edit until 9 June 2027

### Requirement: Exports state the date precision
The conferences export SHALL add two columns after all existing columns: `date_precision` (`day`, `month`, or empty when there are no dates) and `dates_display` (the dates as shown on the site, such as "June 2027"). For a month-only conference, `start_date` SHALL be the first day of the month and `end_date` SHALL be empty. Existing columns SHALL keep their names and positions.

#### Scenario: Export a month-only conference
- **WHEN** an organiser downloads the conferences export and a conference has month-only dates for June 2027
- **THEN** its row has `start_date` 2027-06-01, an empty `end_date`, `date_precision` `month` and `dates_display` "June 2027", in the last two columns

#### Scenario: Existing columns unchanged
- **WHEN** a Google Sheet imports the conferences export by column position
- **THEN** every column it used before this change is still in the same position with the same name

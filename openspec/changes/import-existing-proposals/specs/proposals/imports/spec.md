# Spec Delta

## Purpose

Brings speaker proposals collected outside the app (the Typeform call for speakers) into the app, in bulk and as they arrive, without telling anyone, so the app is a complete record before the committee starts reviewing.

## ADDED Requirements

### Requirement: Preview before importing a file
Organisers SHALL be able to upload a Typeform CSV export and see, before anything is saved:
- how many speakers and proposals would be created, and how many responses are skipped because they were already imported;
- the conference each Typeform conference column maps to;
- the topics, countries and gender answers that could not be matched.

Nothing SHALL be saved until the organiser confirms. Only organisers (admins) SHALL be able to import.

#### Scenario: Preview the sample export
- **WHEN** an organiser uploads an export with two responses, one ticking 6 conferences and one ticking 12, and 3 of those columns are mapped to "skip"
- **THEN** the preview shows two speakers and the number of proposals for the mapped conferences only, and no proposal exists yet

#### Scenario: Reviewer tries to import
- **WHEN** a reviewer opens the Import page
- **THEN** access is refused

### Requirement: Conference columns are mapped once
Each Typeform conference column SHALL be mapped by an organiser to an app conference or to "skip", in the preview. The mapping SHALL be saved and used for later imports and for the live sync. Responses whose ticked conferences are all mapped to "skip" SHALL create nothing.

#### Scenario: Paris 2026 skipped
- **WHEN** the column "apidays Paris 2026 (Dec 1-3)" is mapped to "skip" and a response ticks only Paris 2026 columns
- **THEN** no speaker or proposal is created for that response

### Requirement: One proposal per conference ticked
For each mapped conference a response ticks, the system SHALL create one proposal with:
- the response's talk title, abstract and audience level;
- the session format "Talk (25 min)";
- as topic, the first ticked topic that is in that conference's topic list.

Topics a response names that a mapped conference does not list SHALL be shown in the preview and added to that conference's topic list when the organiser confirms. The proposal SHALL keep the response's submission time.

#### Scenario: Topic chosen per conference
- **WHEN** a response ticks the topics OpenAPI and GreenIO and two conferences, one whose topic list has GreenIO but not OpenAPI
- **THEN** that conference's proposal has the topic GreenIO, and the other conference's has OpenAPI if it lists it

### Requirement: Speakers are matched by email and become guests
The system SHALL match each response's speaker by email address, ignoring case.
- With no matching account, it SHALL create a guest (a speaker account without a password) with the response's first and last name, job title, company, LinkedIn URL and country.
- An existing account's details SHALL NOT be overwritten, except that empty profile fields MAY be filled in.
- Several responses with the same email SHALL become proposals of one speaker.

#### Scenario: Same email twice
- **WHEN** two responses from ana@example.com each tick one 2027 conference
- **THEN** one speaker exists with two proposals

#### Scenario: Existing speaker
- **WHEN** a response's email belongs to an account with a password
- **THEN** the proposals are added to that account and its name and organisation are unchanged

### Requirement: Imported proposals already count
Imported proposals SHALL NOT await email confirmation. They SHALL appear to the committee, in exports and in the API like any other proposal, with the status "under review" unless an organiser decides otherwise.

#### Scenario: Visible to the committee
- **WHEN** a proposal has been imported
- **THEN** it appears in its conference's committee list and in the submissions export

### Requirement: Imports are silent and recorded once
Importing SHALL record one `proposal.imported` event per proposal created and SHALL NOT record `proposal.submitted` or `speaker.registered`, and SHALL NOT issue any emailed link. Importing a response that was already imported SHALL create nothing and record nothing.

#### Scenario: Same response sent twice by the live sync
- **WHEN** n8n sends response "ekpwdfmr..." a second time
- **THEN** the answer says it was already imported, and no proposal or event is added

#### Scenario: Nobody is emailed
- **WHEN** an organiser imports a file of 200 responses
- **THEN** no `email_link.requested`, `proposal.submitted` or `speaker.registered` event is recorded

### Requirement: Other Typeform answers are kept
For each imported proposal the system SHALL keep the response's other answers:
- gender, mapped to Female, Male, Prefer not to say or Other, with the original answer kept;
- interest in sponsoring, being an MC and being an APIMasters instructor, with teaching topics;
- when the terms were accepted, and the Typeform response id.

#### Scenario: Misspelt gender
- **WHEN** a response answers "Fermale"
- **THEN** the stored gender is Female and the original answer "Fermale" is kept alongside

### Requirement: Who sees the Typeform answers
Organisers SHALL see the Typeform answers on the proposal page. The submissions export SHALL include them, with the proposal's source, in new columns after all existing columns. Speakers, reviewers, event payloads and the integration API SHALL NOT include the gender answer.

#### Scenario: Reviewer view
- **WHEN** a reviewer opens an imported proposal
- **THEN** no gender answer is shown

#### Scenario: Export columns
- **WHEN** an organiser downloads the submissions export after an import
- **THEN** every existing column keeps its name and position, and `source` and `typeform_answers` come last

### Requirement: Claim-your-account emails
Organisers SHALL be able to email every imported guest who has not claimed their account. Each guest SHALL get one `claim_account` link valid for 30 days, through the usual `email_link.requested` event. Guests already sent one SHALL be skipped unless the organiser chooses to resend. The page SHALL show how many will be emailed before sending.

#### Scenario: Cutover email
- **WHEN** an organiser sends claim emails and 150 imported guests have not claimed their accounts, 10 of whom were already emailed
- **THEN** 140 `email_link.requested` events with purpose `claim_account` and a 30-day expiry are recorded

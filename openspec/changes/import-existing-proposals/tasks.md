# Tasks

## 1. Schema and profile fields

- [ ] 1.1 Add `db/migrations/007_imports.sql`:
  - `users.gender` and `users.mc_interest`;
  - `proposals.source`, `source_ref`, `source_details` and `topic_exception`, with the partial unique index on `(source_ref, conference_id)`;
  - `email_links.batch`;
  - `import_batches`.

  Verify it applies to a copy of a database at migration 006 and that existing tests pass.
- [ ] 1.2 Add the optional "What is your gender?" and "Would you be open to being an MC?" questions to the profile form; add `mc_interest` to the speaker payload, the speakers export (`mc_interest`) and the submissions export (`speaker_mc_interest`) as new last columns; keep gender out of payloads, the API, exports and `changed_fields`. Verify with integration tests (including that a gender-only change records no event) and in the browser.
- [ ] 1.3 Show a speaker's gender to organisers only (People page and the committee proposal page when the viewer is an organiser); verify with a test that a reviewer's view of the proposal has no gender

## 2. The import rules

- [ ] 2.1 Add the CSV parser (semicolon or comma, quoted multi-line cells, columns found by position between known headers, both `Other` columns, sponsoring and APIMasters columns read past) and verify with a test against the sample export (two responses, 6 and 12 conferences, multi-line abstracts)
- [ ] 2.2 Add `importResponse()` in `src/lib/imports.ts`:
  - **Speakers:** matched by email, with guests created; only empty profile fields filled in an existing profile, including gender and MC interest.
  - **Proposals:** one per mapped conference, with format Talk (25 min), level mapped, and the Typeform submit time kept.
  - **Answers:** topic chosen per conference; country, LinkedIn and gender mapped; `source_details` kept.
  - **Events and repeats:** `proposal.imported` recorded, `already_imported` returned for repeats, and no other events or links.

  Verify with integration tests for each rule in the "proposals/imports" spec.
- [ ] 2.3 Mark proposals whose conference has a topic list but none of the ticked topics as topic exceptions (no topic, `topic_exception = true`); verify with tests including a conference with no topic list (never an exception)
- [ ] 2.4 Add `proposal.imported` to the event catalogue and the endpoint form, not added to existing endpoints; verify the payload (`typeform.response_id`, speaker `mc_interest`, no gender) and that an endpoint without it receives nothing

## 3. Screens

- [ ] 3.1 Add Organise → Import (admins only):
  - upload a CSV into `import_batches` (10 MB limit);
  - preview: counts, the conference mapping with "Skip" (saved to `typeform_conference_map`), topic exceptions by conference, unmatched countries, genders and LinkedIn values, and the site address with a production warning;
  - confirm runs the batch in one transaction.

  Verify in the browser with the sample file, in plain British English, and with a test that a reviewer is refused.
- [ ] 3.2 Add Organise → Import → Topic exceptions:
  - list by conference;
  - per proposal: pick a conference topic, add a ticked topic to the conference's list and use it, or accept no topic;
  - each choice clears the exception and logs history.

  Verify with integration tests and in the browser.
- [ ] 3.3 Show an "Imported from Typeform" box (organisers only) on the committee proposal page with the response id, terms accepted and topics ticked, and add `source` as a new last column of the submissions export; verify existing export columns keep their positions

## 4. Live sync API

- [ ] 4.1 Add `POST /api/v1/imports/typeform` (read-write key; 201 with proposals and topic exceptions, 200 `already_imported`, 200 `skipped`, 400 `invalid_request`, 403 for read keys) using `importResponse()` and the saved mapping; verify with route-level tests including sending the same response twice

## 5. Visa approvals and claim emails

- [ ] 5.1 On the decision form for imported proposals, add "The speaker was told before this app was used", which records a `decision told before import` history entry; verify with a test
- [ ] 5.2 Add "Email claim links to imported guests" on the Import page: shows how many will be emailed, issues one 30-day `claim_account` link each (`batch = 'import-claim'`, via `email_link.requested`), skips guests already emailed unless "resend" is ticked; verify with integration tests and that the forgot-password claim link stays at 7 days

## 6. Documentation and end-to-end

- [ ] 6.1 README:
  - the import, on production only;
  - the conference mapping and the topic exceptions list;
  - the n8n Typeform → API workflow (a Set or Code node that builds the request body from the Typeform trigger's answers);
  - `proposal.imported` for the LinkedIn to-dos, and `mc_interest` for the MC branch;
  - the claim-email step at cutover.

  Verify the n8n mapping code against a Typeform trigger-shaped sample built from the export.
- [ ] 6.2 With the web server, worker and a local receiver running:
  - import the sample file through the screens and resolve a topic exception;
  - send one response through the API twice;
  - set gender and MC interest on a profile;
  - mark one proposal accepted as told before import, and send claim emails.

  Verify the counts, that only `proposal.imported`, `speaker.profile_updated` (MC only) and (at the end) `email_link.requested` events arrive with no gender in any payload, and that the proposals appear in the committee list and exports.

## Workflow follow-up

- Run the real import on the production site (cfp.joinfost.io) once it exists, never on dev-cfp.
- The overview sheet's MC tab and the MC email thread are built in n8n with `add-overview-sheet-sync`.
- Archive with `/opsx:archive` once running in production.

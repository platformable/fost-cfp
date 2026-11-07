# Tasks

## 1. Schema and the import rules

- [ ] 1.1 Add `db/migrations/007_imports.sql` (`proposals.source`, `source_ref`, `source_answers`, the partial unique index on `(source_ref, conference_id)`, `email_links.batch`, `import_batches`) and verify it applies to a copy of a database at migration 006 and existing tests pass
- [ ] 1.2 Add the CSV parser (semicolon or comma, quoted multi-line cells, columns found by position between known headers, both `Other` columns) and verify with a test against the sample export (two responses, 6 and 12 conferences, multi-line abstracts)
- [ ] 1.3 Add `importResponse()` in `src/lib/imports.ts`:
  - **Speakers:** matched by email, with guests created; only empty fields filled in an existing profile.
  - **Proposals:** one per mapped conference, with format Talk (25 min), level mapped, and the Typeform submit time kept.
  - **Answers:** topic chosen per conference; country, LinkedIn and gender mapped; other answers stored in `source_answers`.
  - **Events and repeats:** `proposal.imported` recorded, `already_imported` returned for repeats, and no other events or links.

  Verify with integration tests for each rule in the "proposals/imports" spec.
- [ ] 1.4 Add `proposal.imported` to the event catalogue and the endpoint form, not added to existing endpoints; verify the payload (no gender, `typeform` block) and that an endpoint without it receives nothing

## 2. File import screens

- [ ] 2.1 Add Organise → Import (admins only):
  - upload a CSV into `import_batches` (10 MB limit);
  - preview: counts, the conference mapping with "Skip" (saved to `typeform_conference_map`), missing topics per conference, unmatched countries, genders and LinkedIn values, and the site address with a production warning;
  - confirm runs the batch in one transaction and adds the missing topics.

  Verify in the browser with the sample file, in plain British English, and with a test that a reviewer is refused.
- [ ] 2.2 Show an "Imported from Typeform" box (organisers only) on the committee proposal page, and add `source` and `typeform_answers` as the last columns of the submissions export; verify existing export columns keep their positions and that speakers and reviewers never see the gender answer

## 3. Live sync API

- [ ] 3.1 Add `POST /api/v1/imports/typeform` (read-write key; 201, 200 `already_imported`, 200 `skipped`, 400 `invalid_request`, 403 for read keys) using `importResponse()` and the saved mapping; verify with route-level tests including sending the same response twice

## 4. Visa approvals and claim emails

- [ ] 4.1 On the decision form for imported proposals, add "The speaker was told before this app was used", which records a `decision told before import` history entry; verify with a test
- [ ] 4.2 Add "Email claim links to imported guests" on the Import page: shows how many will be emailed, issues one 30-day `claim_account` link each (`batch = 'import-claim'`, via `email_link.requested`), skips guests already emailed unless "resend" is ticked; verify with integration tests and that the forgot-password claim link stays at 7 days

## 5. Documentation and end-to-end

- [ ] 5.1 README: the import (production only), the conference mapping, the n8n Typeform → API workflow (a Set or Code node that builds the request body from the Typeform trigger's answers), `proposal.imported` for the LinkedIn to-dos, and the claim-email step at cutover; verify the n8n mapping code against a Typeform trigger-shaped sample built from the export
- [ ] 5.2 With the web server, worker and a local receiver running, import the sample file through the screens, send one response through the API twice, mark one proposal accepted as told before import, and send claim emails; verify the counts, that only `proposal.imported` and (at the end) `email_link.requested` events arrive, and that the proposals appear in the committee list and exports

## Workflow follow-up

- Run the real import on the production site (cfp.joinfost.io) once it exists, never on dev-cfp.
- Archive with `/opsx:archive` once running in production.

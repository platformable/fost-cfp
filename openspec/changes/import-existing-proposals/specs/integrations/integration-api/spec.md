# Spec Delta

## ADDED Requirements

### Requirement: Add a Typeform response
With a `read-write` key, `POST /api/v1/imports/typeform` SHALL import one Typeform response under the same rules as a file import, using the saved conference mapping. The answer SHALL list the proposals created, or say that the response was already imported or that none of its conferences is mapped.

#### Scenario: New response from n8n
- **WHEN** n8n posts a new response ticking two mapped conferences with a read-write key
- **THEN** the answer is 201 with the two proposal ids, and two `proposal.imported` events are recorded

#### Scenario: Already imported
- **WHEN** n8n posts the same response again
- **THEN** the answer is 200 with `already_imported: true` and nothing is added

#### Scenario: No conference mapped
- **WHEN** a response ticks only conferences mapped to "skip"
- **THEN** the answer is 200 with `skipped: "no mapped conferences"` and nothing is added

### Requirement: Typeform import requests are checked
A `read` key SHALL get 403 from `POST /api/v1/imports/typeform`. A body without a response id, a submission time or an email SHALL get 400 with error code `invalid_request`, and nothing SHALL be saved.

#### Scenario: Read key
- **WHEN** n8n posts a response with a `read` key
- **THEN** the answer is 403 and nothing is added

#### Scenario: Missing email
- **WHEN** a body has no email
- **THEN** the answer is 400 with error code `invalid_request`

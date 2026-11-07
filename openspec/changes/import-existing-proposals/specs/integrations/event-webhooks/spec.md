# Spec Delta

## MODIFIED Requirements

### Requirement: Initial event catalogue
The system SHALL emit these event types: `speaker.registered`, `speaker.profile_updated`, `proposal.submitted`, `proposal.updated`, `proposal.withdrawn`, `proposal.speaker_confirmed`, `proposal.speaker_declined`, `email_link.requested` and `proposal.imported`. Submitting one proposal to several conferences SHALL emit one `proposal.submitted` event per conference. An `email_link.requested` or `proposal.imported` event SHALL only be delivered to endpoints that have chosen it.

#### Scenario: Multi-conference submission
- **WHEN** a speaker submits one proposal to two conferences
- **THEN** two `proposal.submitted` events are recorded, one for each conference's proposal

#### Scenario: Edit with no changes
- **WHEN** a speaker saves their proposal without changing anything
- **THEN** no `proposal.updated` event is recorded

#### Scenario: Speaker confirms their slot
- **WHEN** a speaker confirms an accepted proposal
- **THEN** a `proposal.speaker_confirmed` event is recorded

#### Scenario: Existing endpoint does not get links
- **WHEN** a password reset link is issued and the only endpoint was created before this change with all the events it offered then
- **THEN** that endpoint receives nothing until an organiser ticks `email_link.requested` for it

#### Scenario: Imported proposal
- **WHEN** a Typeform response ticking two mapped conferences is imported
- **THEN** two `proposal.imported` events are recorded, each with the proposal, its speaker and its conference, and no `proposal.submitted` event

### Requirement: Payloads are self-contained
Proposal events SHALL include the proposal (title, abstract, format, topic, level, co-speakers, speaker-visible status, links), the speaker's profile (name, first and last name, email, job title, organisation, bio, LinkedIn URL, country name and code, headshot URL and headshot source, whether the speaker has a full account or is a guest, and interest in being an MC) and the conference (name, slug, location, dates). Speaker events SHALL include the speaker's profile.

#### Scenario: n8n adds a speaker to Pipedrive
- **WHEN** n8n receives `proposal.submitted`
- **THEN** the payload already contains the speaker's bio, headshot and LinkedIn URL, so no call back to the app is needed

#### Scenario: Profile changes
- **WHEN** a speaker changes their bio
- **THEN** a `speaker.profile_updated` event is recorded with the updated profile and a list of the fields that changed

#### Scenario: Guest speaker
- **WHEN** n8n receives `proposal.submitted` for a confirmed guest proposal
- **THEN** the speaker's `account_status` is `guest`, so the receipt email can invite them to claim their account

#### Scenario: MC candidate imported
- **WHEN** n8n receives `proposal.imported` for a speaker who said yes to being an MC in Typeform
- **THEN** the speaker object has `mc_interest: true`, so n8n can add them to the MC tab and start the MC email thread

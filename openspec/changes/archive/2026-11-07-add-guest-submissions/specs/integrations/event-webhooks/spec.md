# Spec Delta

## MODIFIED Requirements

### Requirement: Payloads are self-contained
Proposal events SHALL include the proposal (title, abstract, format, topic, level, co-speakers, speaker-visible status, links), the speaker's profile (name, first and last name, email, job title, organisation, bio, LinkedIn URL, country name and code, headshot URL and headshot source, and whether the speaker has a full account or is a guest) and the conference (name, slug, location, dates). Speaker events SHALL include the speaker's profile.

#### Scenario: n8n adds a speaker to Pipedrive
- **WHEN** n8n receives `proposal.submitted`
- **THEN** the payload already contains the speaker's bio, headshot and LinkedIn URL, so no call back to the app is needed

#### Scenario: Profile changes
- **WHEN** a speaker changes their bio
- **THEN** a `speaker.profile_updated` event is recorded with the updated profile and a list of the fields that changed

#### Scenario: Guest speaker
- **WHEN** n8n receives `proposal.submitted` for a confirmed guest proposal
- **THEN** the speaker's `account_status` is `guest`, so the receipt email can invite them to claim their account

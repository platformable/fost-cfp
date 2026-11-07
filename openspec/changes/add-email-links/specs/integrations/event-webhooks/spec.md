# Spec Delta

## MODIFIED Requirements

### Requirement: Initial event catalogue
The system SHALL emit these event types: `speaker.registered`, `speaker.profile_updated`, `proposal.submitted`, `proposal.updated`, `proposal.withdrawn`, `proposal.speaker_confirmed`, `proposal.speaker_declined` and `email_link.requested`. Submitting one proposal to several conferences SHALL emit one `proposal.submitted` event per conference. An `email_link.requested` event SHALL only be delivered to endpoints that have chosen it.

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

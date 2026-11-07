# Spec Delta

## Purpose

Defines the optional details speakers can add to their profile beyond contact and bio, who can see each one, and how they reach automations.

## ADDED Requirements

### Requirement: Optional gender
The speaker profile SHALL offer an optional question "What is your gender?" with the answers Female, Male, Prefer not to say and Other. Leaving it unanswered SHALL be allowed.

#### Scenario: Speaker answers
- **WHEN** a speaker chooses "Prefer not to say" on their profile and saves
- **THEN** their profile keeps that answer and shows it when they return

#### Scenario: Speaker skips it
- **WHEN** a speaker saves their profile without answering
- **THEN** the profile saves and the gender stays unanswered

### Requirement: Gender is seen by organisers only
A speaker's gender answer SHALL be visible to that speaker and to organisers (admins) only. It SHALL NOT be shown to reviewers and SHALL NOT appear in event payloads, the integration API, spreadsheet exports or the list of changed fields in `speaker.profile_updated`.

#### Scenario: Reviewer view
- **WHEN** a reviewer opens a proposal from a speaker who answered the gender question
- **THEN** no gender is shown

#### Scenario: Profile event
- **WHEN** a speaker changes only their gender answer
- **THEN** no `speaker.profile_updated` event is recorded

### Requirement: Optional interest in being an MC
The speaker profile SHALL offer an optional yes/no question "Would you be open to being an MC (Master of Ceremonies) at a FOST conference?". The answer SHALL be visible to organisers, included in the speaker object of event payloads and API responses as `mc_interest` (true, false or null when unanswered), and included in the speakers and submissions exports as a new last column.

#### Scenario: Speaker says yes
- **WHEN** a speaker ticks yes and saves their profile
- **THEN** a `speaker.profile_updated` event is recorded listing `mc_interest` as changed, with `mc_interest: true` in the speaker object

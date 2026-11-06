# conferences/session-formats Specification

## Purpose
Defines the session formats speakers choose from, the defaults a conference gets, and what happens to existing conferences and proposals when those defaults change.

## Requirements

### Requirement: Default session formats
A conference whose session formats are left blank SHALL offer, in this order: "Talk (25 min)", "Panel (25 min)", "Q&A Onstage (25 min)" and "Workshop (50 min)".

#### Scenario: New conference with blank formats
- **WHEN** an organiser creates a conference and leaves the session formats blank
- **THEN** speakers proposing to it choose from Talk (25 min), Panel (25 min), Q&A Onstage (25 min) and Workshop (50 min)

#### Scenario: Organiser lists their own formats
- **WHEN** an organiser enters their own session formats for a conference
- **THEN** speakers choose from that list only

### Requirement: Existing conferences use the new formats
When this change is deployed, every existing conference SHALL have its session formats set to the default list, replacing any earlier list. Organisers SHALL still be able to edit them afterwards.

#### Scenario: Conference with old formats
- **WHEN** the app starts with this change and a conference offers "Talk (30 min)" and "Lightning talk (10 min)"
- **THEN** that conference offers Talk (25 min), Panel (25 min), Q&A Onstage (25 min) and Workshop (50 min)

### Requirement: Proposals keep their submitted format
Changing a conference's formats SHALL NOT change the format recorded on its existing proposals. A speaker editing such a proposal SHALL be able to keep its current format or choose one from the conference's current list.

#### Scenario: Proposal submitted as a 30-minute talk
- **WHEN** a speaker edits a proposal submitted as "Talk (30 min)" after the formats changed
- **THEN** the proposal still shows "Talk (30 min)" and the speaker can save it unchanged or choose "Talk (25 min)"

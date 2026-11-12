# accounts/speaker-profile Specification

## Purpose
Defines the optional details speakers can add to their profile beyond contact and bio, who can see each one, and how they reach automations.

## Requirements

### Requirement: Optional Bluesky profile
The speaker profile SHALL offer an optional "Bluesky profile" field next to the LinkedIn profile. Leaving it empty SHALL be allowed, and clearing it SHALL remove the stored profile.

#### Scenario: Speaker leaves it empty
- **WHEN** a speaker saves their profile without a Bluesky profile
- **THEN** the profile saves and the Bluesky profile stays empty

#### Scenario: Speaker clears it
- **WHEN** a speaker with a stored Bluesky profile empties the field and saves
- **THEN** the profile saves with no Bluesky profile

### Requirement: Bluesky profiles are stored as one address form
The system SHALL accept a Bluesky handle with or without a leading `@` (a `bsky.social` handle or a custom-domain handle), or a `bsky.app/profile/` address with or without `https://`, and SHALL store it as `https://bsky.app/profile/<handle>` with the handle in lower case. A link to a post SHALL be stored as the profile it belongs to.

#### Scenario: Handle with @
- **WHEN** a speaker enters `@Ada.bsky.social`
- **THEN** the profile stores `https://bsky.app/profile/ada.bsky.social` and shows it when they return

#### Scenario: Custom-domain handle without @
- **WHEN** a speaker enters `mark.platformable.com`
- **THEN** the profile stores `https://bsky.app/profile/mark.platformable.com`

#### Scenario: Link to a post
- **WHEN** a speaker enters `bsky.app/profile/ada.bsky.social/post/3kabc`
- **THEN** the profile stores `https://bsky.app/profile/ada.bsky.social`

#### Scenario: Profile address by account identifier
- **WHEN** a speaker enters `https://bsky.app/profile/did:plc:abc123xyz`
- **THEN** the profile stores `https://bsky.app/profile/did:plc:abc123xyz`

### Requirement: Values that are not Bluesky profiles are refused
The system SHALL refuse a Bluesky profile that is neither a valid handle nor a `bsky.app` profile address, with a plain message that shows an example, and SHALL keep everything else the speaker typed on the form. It SHALL NOT check with Bluesky that the account exists.

#### Scenario: Another site's address
- **WHEN** a speaker enters `https://x.com/ada`
- **THEN** the profile is not saved, the message says the Bluesky profile must be a handle like @name.bsky.social or a bsky.app address, and the form keeps their other answers

#### Scenario: Text that is not a handle
- **WHEN** a speaker enters `ada lovelace`
- **THEN** the profile is not saved and the same message is shown

### Requirement: Committee members see the Bluesky profile
The committee's proposal page SHALL show a link to the speaker's Bluesky profile, next to the LinkedIn link, when the speaker has one.

#### Scenario: Reviewer opens a proposal
- **WHEN** a reviewer opens a proposal from a speaker with a Bluesky profile
- **THEN** a "Bluesky profile" link to that address is shown with the speaker's details

### Requirement: The Bluesky profile reaches automations
The speaker object in event payloads and in integration API responses SHALL include `bluesky_profile_url`: the stored address, or null when empty. A change to it SHALL be recorded as `speaker.profile_updated` with `bluesky_profile_url` in `changed_fields`.

#### Scenario: Speaker adds a Bluesky profile
- **WHEN** a speaker adds a Bluesky profile and saves
- **THEN** a `speaker.profile_updated` event is recorded listing `bluesky_profile_url` as changed, with the address in the speaker object

#### Scenario: Speaker without one
- **WHEN** n8n reads a speaker without a Bluesky profile through the API
- **THEN** the speaker object has `bluesky_profile_url: null`

### Requirement: The Bluesky profile is in the exports as a last column
The speakers export SHALL gain `bluesky_profile_url`, and the submissions and program exports SHALL gain `speaker_bluesky_profile_url`, each as a new last column, empty when the speaker has none. All existing columns SHALL keep their names and positions.

#### Scenario: Speakers export
- **WHEN** an organiser downloads the speakers export
- **THEN** its last column is `bluesky_profile_url` and the columns before it are unchanged

#### Scenario: Program export
- **WHEN** an organiser downloads the program export
- **THEN** its last column is `speaker_bluesky_profile_url`, filled for speakers who have a Bluesky profile

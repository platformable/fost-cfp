# Spec Delta

## Purpose

Lets people prove they own an email address with a single-use link sent to it, so they can reset a forgotten password, accept a committee invite, or (in later changes) confirm and claim what they submitted, with emails sent by n8n rather than the app.

## ADDED Requirements

### Requirement: Emailed links are single-use, expiring and purpose-bound
Each emailed link SHALL work once, SHALL stop working after its expiry time, and SHALL only do what it was issued for. Password reset links SHALL expire after 24 hours and committee invites after 7 days. Issuing a new link for the same person and purpose SHALL make their earlier unused links for that purpose stop working. The system SHALL NOT store a link's secret in a form that can be turned back into the link.

#### Scenario: Link used twice
- **WHEN** someone opens a password reset link they have already used
- **THEN** they are told the link has already been used and offered a new one

#### Scenario: Link expired
- **WHEN** someone opens a password reset link 25 hours after it was issued
- **THEN** they are told the link has expired and offered a new one

#### Scenario: Newer link issued
- **WHEN** a speaker asks for two password reset links and opens the first
- **THEN** the first link does not work and the second does

### Requirement: Forgot password
The sign-in page SHALL offer a "Forgot your password?" link. A person who enters an email address SHALL always see the same confirmation message, whether or not an account exists for it. When an account exists, the system SHALL issue a password reset link for it. Opening a valid link SHALL let the person choose a new password of at least 8 characters; saving it SHALL use up the link, sign the person in and sign out their other sessions.

#### Scenario: Known email
- **WHEN** a speaker enters their account's email on the forgot password page
- **THEN** they see "If an account exists for that email, we have sent a link to reset your password" and a password reset link is issued for their account

#### Scenario: Unknown email
- **WHEN** someone enters an email that has no account
- **THEN** they see the same message and no link is issued

#### Scenario: Reset
- **WHEN** a speaker opens a valid reset link and saves a new password
- **THEN** they are signed in, their other sessions are signed out, and the old password no longer works

### Requirement: Limits on password links
The system SHALL issue at most 3 password reset links per email address per hour through the forgot password form. Requests over the limit SHALL show the same confirmation message and issue nothing.

#### Scenario: Fourth request in an hour
- **WHEN** someone requests a password reset for the same email for the fourth time within an hour
- **THEN** the usual message is shown and no new link is issued

### Requirement: Accounts without a password
An account MAY exist before its owner has set a password. Such an account SHALL NOT be signed into with any password. Its owner SHALL be able to set a password through a valid emailed link for that account, including through the forgot password form.

#### Scenario: Invited reviewer tries to sign in
- **WHEN** an invited reviewer who has not set a password enters their email and any password on the sign-in page
- **THEN** sign-in fails with the usual "Incorrect email or password" message

#### Scenario: Invite lost
- **WHEN** an invited reviewer uses the forgot password form instead of their invite
- **THEN** they receive a password link and can set a password

### Requirement: Committee invites
Organisers SHALL be able to add a committee member by email. If no account exists for the email, the organiser SHALL give the person's first and last name, and the system SHALL create a reviewer account without a password, add it to the committee and issue a committee invite link. If an account exists, the system SHALL add it to the committee as today, without issuing a link.

#### Scenario: Invite a new reviewer
- **WHEN** an organiser adds jo@example.com with the name Jo Bloggs to a conference's committee and no account exists for that email
- **THEN** Jo Bloggs appears in the committee, and an invite link valid for 7 days is issued for Jo's new reviewer account

#### Scenario: Add an existing user
- **WHEN** an organiser adds the email of someone who already has an account
- **THEN** that person is added to the committee and no link is issued

### Requirement: Links are sent through automations
When the system issues a link to be emailed, it SHALL record an `email_link.requested` event carrying the recipient's name and email, the purpose, the full link and its expiry time, so that an automation can send the email. The system SHALL NOT send email itself.

#### Scenario: n8n sends the reset email
- **WHEN** a speaker requests a password reset and an endpoint subscribed to `email_link.requested` exists
- **THEN** that endpoint receives an event with the purpose `password_reset`, the speaker's name and email, the link and its expiry

### Requirement: Organiser copies a link
Organisers SHALL be able to create a password link for any account from the People page and copy it, without an email being sent. The link SHALL be shown once and SHALL follow the same single-use and expiry rules as a password reset link. No other role SHALL be able to do this.

#### Scenario: Email did not arrive
- **WHEN** an organiser presses "Copy password link" for a speaker
- **THEN** a password link is shown once for the organiser to copy, no `email_link.requested` event is recorded, and the speaker's earlier unused password links stop working

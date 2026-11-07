# proposals/guest-submissions Specification

## Purpose
Lets speakers submit proposals without creating an account, counts a guest proposal only once its email address is confirmed, and lets guests claim a full account later.

## Requirements

### Requirement: Apply without an account
A visitor who is not signed in SHALL be able to submit a proposal to one or more open conferences by giving their first name, last name, email address and, optionally, organisation, alongside the usual proposal fields. The same validation SHALL apply as for signed-in speakers.

#### Scenario: Guest submits to two conferences
- **WHEN** a signed-out visitor fills in their name and email and submits a proposal to two open conferences
- **THEN** two proposals awaiting confirmation are saved and the visitor is asked to check their email

#### Scenario: Missing email
- **WHEN** a signed-out visitor submits without an email address
- **THEN** nothing is saved and they are asked for their email

### Requirement: Guest proposals count only after email confirmation
A guest submission SHALL be saved as awaiting confirmation, and the system SHALL issue a confirmation link for it (purpose `confirm_proposal`, valid for 6 months). Until the link is used, the proposals SHALL NOT appear to the committee, in conference counts, exports or the API, and SHALL NOT record any event other than the `email_link.requested` that carries the link. Organisers SHALL see only how many proposals are awaiting confirmation per conference.

#### Scenario: Not yet confirmed
- **WHEN** a guest has submitted but not used the confirmation link
- **THEN** the committee list, the submissions export and `/api/v1/proposals` do not include the proposal, and no `proposal.submitted` event has been recorded

#### Scenario: Confirmed
- **WHEN** the guest opens the confirmation link and confirms
- **THEN** the proposals appear to the committee and in exports, a `proposal.submitted` event is recorded for each conference, and a `speaker.registered` event is recorded if this is the guest's first confirmed proposal

#### Scenario: Call closed before confirmation
- **WHEN** a guest submits while a call is open and confirms after it has closed
- **THEN** the proposal is confirmed and keeps its original submission time

### Requirement: The same message whether or not an account exists
Submitting as a guest with an email that already belongs to an account SHALL show the same message as for a new email. After confirmation, the proposals SHALL belong to that existing account.

#### Scenario: Email of an existing speaker
- **WHEN** a signed-out visitor submits as a guest using the email of an existing speaker account
- **THEN** they see the usual "check your email" message, and once the link is used the proposal appears in that speaker's proposals

### Requirement: Guests are read-only until they claim their account
A guest account SHALL have no password, so it cannot be signed into and its proposals cannot be edited or withdrawn by the guest. A guest SHALL be able to claim the account by setting a password through an emailed link: from the confirmation page, from the forgot password form, or by registering with the same email, which SHALL send a claim link (purpose `claim_account`, valid for 7 days) instead of refusing the registration. A claimed account SHALL be an ordinary speaker account.

#### Scenario: Set a password when confirming
- **WHEN** a guest confirms and chooses to set a password on the confirmation page
- **THEN** they are signed in and can edit their proposals

#### Scenario: Register with a guest's email
- **WHEN** someone registers with the email of a guest account
- **THEN** no new account is created, they are told to check their email, and a `claim_account` link is issued for the guest account

#### Scenario: Guest stays a guest
- **WHEN** a guest confirms and does not set a password
- **THEN** their proposals count, and they cannot sign in until they claim the account

### Requirement: Unconfirmed submissions expire
Proposals still awaiting confirmation 6 months after submission SHALL be deleted. A guest account left with no proposals and no committee role SHALL be deleted with them.

#### Scenario: Never confirmed
- **WHEN** a guest proposal has been awaiting confirmation for 6 months and one day
- **THEN** it is deleted, and so is the guest account if it has nothing else

### Requirement: Anti-bot check
Guest submissions SHALL be refused, without saying why, when a hidden form field is filled in or the form was submitted less than 3 seconds after it was shown. No email address SHALL have more than 5 proposals awaiting confirmation; further guest submissions for it SHALL be refused with a message asking the person to confirm the ones already sent. No third-party captcha SHALL be used.

#### Scenario: Bot fills the hidden field
- **WHEN** a guest submission arrives with the hidden field filled in
- **THEN** nothing is saved and the usual "check your email" message is shown

#### Scenario: Too many unconfirmed
- **WHEN** an email address already has 5 proposals awaiting confirmation and another guest submission arrives for it
- **THEN** nothing is saved and the visitor is asked to confirm the proposals already sent first

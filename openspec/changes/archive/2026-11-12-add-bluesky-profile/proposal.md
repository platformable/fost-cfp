# Proposal

## Why

FOST's social channels are LinkedIn and Bluesky (no X), but speaker profiles only ask for LinkedIn. With a Bluesky profile on record, n8n and the team can tag and follow speakers on Bluesky when promoting talks, and the profile is ready to pass to FOSTBeat author profiles later (roadmap change 13). Adding it before the mid-December cutover means speakers claiming their accounts see the field straight away.

## What Changes

- **Profile page:** a new optional "Bluesky profile" field next to "LinkedIn profile URL".
  - Speakers can enter a handle (`@name.bsky.social`, or a custom-domain handle such as `@mark.platformable.com`), the handle without the `@`, or a `bsky.app/profile/...` address, including a link to one of their posts.
  - The app stores one form: `https://bsky.app/profile/<handle>`, with the handle in lower case.
  - Anything else (another site's address, text that isn't a handle) is refused with a plain message, the way a non-LinkedIn address is refused today.
- **Committee proposal page:** shows a "Bluesky profile" link next to the LinkedIn one.
- **Automations:** the speaker object in event payloads and in the integration API gains `bluesky_profile_url` (null when empty). A change to it is listed in `changed_fields` of `speaker.profile_updated`.
- **Exports:** each export below gets a new last column, so existing columns keep their positions:
  - `bluesky_profile_url` on speakers;
  - `speaker_bluesky_profile_url` on submissions and on program.

  Nothing is renamed or removed, so this is not a breaking change for sheets or mail merges.
- **Not included:**
  - **No Typeform import changes.** Typeform has no Bluesky question, so imported speakers start with the field empty.
  - **No account check.** The app does not check with Bluesky that the account exists.
  - **No other social networks.**

## Capabilities

### New Capabilities
- `accounts/speaker-profile`: the optional Bluesky profile on a speaker's profile, how it is entered and stored, and where it is shared. The `import-existing-proposals` change, built but not yet archived, introduces this capability for gender and MC interest. This change adds separate requirements to it, so the two merge whichever is archived first.

### Modified Capabilities
None. The `integrations/event-webhooks` and `integrations/integration-api` specs describe the speaker object without listing its fields, so their requirements do not change.

## Impact

- **Database:** new migration `db/migrations/008_bluesky_profile.sql` adding `users.bluesky_profile_url` (text, empty by default).
- **Code:**
  - `src/lib/users.ts`: the profile fields, a `normalizeBluesky()` function, and checking the value when it is read.
  - `src/lib/auth.ts`: the `User` type.
  - `src/lib/payloads.ts`: speaker columns and payload.
  - `src/lib/export.ts`: the speakers, submissions and program exports.
  - `src/lib/proposals.ts`: the speaker fields on a proposal.
  - Profile form and page, and the committee proposal page.
- **Integrations:**
  - n8n receives a new `bluesky_profile_url` field.
  - The three exports gain one last column each.
- **Tests:** the pinned export headers and the payload field list change.
- **Docs:** the README's export and payload notes.

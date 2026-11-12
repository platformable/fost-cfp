# Tasks

## 1. Storing the profile

- [ ] 1.1 Add `db/migrations/008_bluesky_profile.sql` (`users.bluesky_profile_url TEXT NOT NULL DEFAULT ''`) and `bluesky_profile_url` on the `User` type in `src/lib/auth.ts`. Verify that it applies on start-up to a database at migration 007 and that `npm test` still passes.
- [ ] 1.2 Add `normalizeBluesky()` to `src/lib/users.ts` (design decision 2), and add `bluesky_profile_url` to the end of `PROFILE_FIELDS`, with `readProfile` refusing values it doesn't accept using the message in the spec. Verify with tests covering every scenario in "Bluesky profiles are stored as one address form" and "Values that are not Bluesky profiles are refused", plus an empty value, a 64-character part, and an `x.com` address.
- [ ] 1.3 Check that `saveProfile` lists `bluesky_profile_url` in `changed_fields` and that clearing it saves an empty value. Verify with an integration test: add → event with the address in the speaker object; unchanged save → no event; clear → event and an empty column. Also check that the Typeform import leaves the column untouched (an existing imports test still passes).

## 2. Where it shows and goes

- [ ] 2.1 Add the "Bluesky profile" field under "LinkedIn profile URL" on the profile form (optional, placeholder `@name.bsky.social`, no auto-capitalise or spell check), and redisplay what the speaker typed after an error. Verify in the browser: save `@Ada.bsky.social`, see `https://bsky.app/profile/ada.bsky.social` on return; enter `https://x.com/ada`, see the message and keep the other answers. Check at phone width.
- [ ] 2.2 Show a "Bluesky profile" link next to the LinkedIn link on the committee proposal page (`src/lib/proposals.ts` speaker fields, `src/app/review/proposals/[id]/page.tsx`). Verify in the browser as a reviewer.
- [ ] 2.3 Add `bluesky_profile_url` to `SPEAKER_COLUMNS` and `speakerPayload()` (null when empty). Verify by updating the payload field-list test in `test/integrations.test.mts`, and with an API test showing `GET /api/v1/speakers/{id}` returns it (null and set).
- [ ] 2.4 Add `bluesky_profile_url` as the last column of the speakers export, and `speaker_bluesky_profile_url` as the last column of the submissions and program exports. Verify by updating the pinned-header tests so every existing column keeps its position, and with a test that a speaker's address appears in all three.

## 3. Documentation and checks

- [ ] 3.1 Update the README: the payload description (add the Bluesky profile next to LinkedIn) and the exports table. Verify by reading the rendered sections.
- [ ] 3.2 Run `npm run typecheck`, `npm test` and `npm run build`, then an end-to-end run with the server, worker and a local receiver: set a Bluesky profile, check the `speaker.profile_updated` delivery and the three exports. Verify that everything passes and screenshot the profile form and the committee page.

## Workflow follow-up

- Archive with `/opsx:archive` once running on dev-cfp, before the mid-December cutover; update the roadmap's 3c status at the same time.

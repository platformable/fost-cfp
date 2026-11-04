# Tasks

## 1. Defaults and migration

- [x] 1.1 Move `DEFAULT_FORMATS` to `src/lib/formats.ts` with the new list and use it as the conference form's placeholder; verify `npm run typecheck`
- [x] 1.2 Add `db/migrations/003_new_default_session_formats.sql` setting every conference's formats to the new list; verify on a copy of a database with 001 applied that both conferences change and proposal formats do not
- [x] 1.3 Renumber the `add-integration-events` migration to 004
- [x] 1.4 Update demo data and tests to "Talk (25 min)"; verify `npm test` passes

## Workflow follow-up

- Archive the change with `/opsx:archive` once it is deployed to dev-cfp.

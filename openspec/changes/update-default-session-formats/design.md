# Design

## Context

Session formats are stored per conference as text, one per line, in `conferences.formats`. A blank value means "use the defaults" (`DEFAULT_FORMATS`), resolved when the page loads. Each proposal stores the chosen label as text in `proposals.format`. Validation accepts a format from the conference's list, or the proposal's current format unchanged.

## Decisions

- **Write the list into every conference rather than blanking it.** An explicit list means a later change to the defaults will not silently change these conferences again. All current conferences are for next year, so replacing custom lists is intended.
- **Do not relabel proposals.** There is no honest mapping for "Lightning talk (10 min)", and changing what a speaker submitted without telling them would be surprising. Organisers can see old labels in the submissions export and ask speakers to update.
- **Move `DEFAULT_FORMATS` to `src/lib/formats.ts`** so the conference form (a client component) can show it as the placeholder without importing the database code.
- **Migration number:** this change takes 003; `add-integration-events` moves to 004.

## Risks

- A proposal's format may not appear in its conference's list. The existing "keep current value" rule already handles this; exports show the original label.

## Data model

No columns are added or removed. Only the values of `conferences.formats` change.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://dev-cfp.platformable.com/schema/session-formats.json",
  "title": "Session formats",
  "$defs": {
    "conference": {
      "type": "object",
      "properties": {
        "id": { "type": "integer" },
        "formats": {
          "type": "string",
          "description": "CHANGED: one format per line. Set by migration 003 to the default list on every existing conference. Empty string means the defaults below."
        }
      },
      "required": ["id", "formats"]
    },
    "default_formats": {
      "description": "CHANGED: the formats a conference offers when its formats are blank.",
      "const": ["Talk (25 min)", "Panel (25 min)", "Q&A Onstage (25 min)", "Workshop (50 min)"]
    },
    "proposal": {
      "type": "object",
      "properties": {
        "id": { "type": "integer" },
        "conference_id": { "type": "integer" },
        "format": {
          "type": "string",
          "description": "Label chosen by the speaker, kept as submitted even if it is no longer in the conference's list."
        }
      },
      "required": ["id", "conference_id", "format"]
    }
  }
}
```

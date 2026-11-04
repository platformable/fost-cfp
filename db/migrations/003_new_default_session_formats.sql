-- New default session formats for FOST conferences, applied to every existing conference.
-- Proposals keep the format label they were submitted with.

UPDATE conferences
SET formats = E'Talk (25 min)\nPanel (25 min)\nQ&A Onstage (25 min)\nWorkshop (50 min)',
    updated_at = now();

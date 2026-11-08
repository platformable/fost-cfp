-- Importing existing CFPs from Typeform, and two optional profile fields.
-- Only adds columns and a table, so it is safe on a live database.

-- Optional profile answers. Gender is seen only by the speaker and organisers.
ALTER TABLE users ADD COLUMN gender TEXT
  CONSTRAINT users_gender_check CHECK (gender IN ('Female', 'Male', 'Prefer not to say', 'Other'));
ALTER TABLE users ADD COLUMN mc_interest BOOLEAN;

-- Where a proposal came from, and import details kept for organisers.
ALTER TABLE proposals ADD COLUMN source TEXT NOT NULL DEFAULT 'app'
  CONSTRAINT proposals_source_check CHECK (source IN ('app', 'typeform_import', 'typeform_sync'));
ALTER TABLE proposals ADD COLUMN source_ref TEXT;          -- Typeform response id
ALTER TABLE proposals ADD COLUMN source_details JSONB;     -- terms accepted, topics ticked, gender as written
ALTER TABLE proposals ADD COLUMN topic_exception BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX proposals_source_ref_idx ON proposals (source_ref, conference_id) WHERE source_ref IS NOT NULL;
CREATE INDEX proposals_topic_exception_idx ON proposals (conference_id) WHERE topic_exception;

-- Links sent by a bulk action (for example 'import-claim').
ALTER TABLE email_links ADD COLUMN batch TEXT;

CREATE TABLE import_batches (
  id          SERIAL PRIMARY KEY,
  filename    TEXT NOT NULL,
  content     TEXT,                      -- cleared once imported
  status      TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'imported', 'discarded')),
  counts      JSONB,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  imported_at TIMESTAMPTZ
);

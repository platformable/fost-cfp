-- FOST Call for Speakers: initial schema.

CREATE TABLE users (
  id                   SERIAL PRIMARY KEY,
  email                TEXT NOT NULL,
  password_hash        TEXT NOT NULL,
  first_name           TEXT NOT NULL,
  last_name            TEXT NOT NULL DEFAULT '',
  -- Full name, kept up to date by PostgreSQL (read-only).
  name                 TEXT GENERATED ALWAYS AS (btrim(first_name || ' ' || last_name)) STORED,
  role                 TEXT NOT NULL DEFAULT 'speaker' CHECK (role IN ('speaker', 'reviewer', 'admin')),
  organization         TEXT NOT NULL DEFAULT '',
  job_title            TEXT NOT NULL DEFAULT '',
  bio                  TEXT NOT NULL DEFAULT '',
  linkedin_profile_url TEXT NOT NULL DEFAULT '',
  phone                TEXT NOT NULL DEFAULT '',
  country              TEXT NOT NULL DEFAULT '',  -- ISO 3166-1 alpha-2 code, '' = not given
  photo_url            TEXT NOT NULL DEFAULT '',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,  -- SHA-256 of the cookie token
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE conferences (
  id                   SERIAL PRIMARY KEY,
  name                 TEXT NOT NULL,
  slug                 TEXT NOT NULL UNIQUE,
  description          TEXT NOT NULL DEFAULT '',
  location             TEXT NOT NULL DEFAULT '',
  website              TEXT NOT NULL DEFAULT '',
  start_date           DATE,
  end_date             DATE,
  cfp_opens            DATE,   -- NULL = open now
  cfp_closes           DATE,   -- NULL = never closes; inclusive
  topics               TEXT NOT NULL DEFAULT '',  -- one per line
  formats              TEXT NOT NULL DEFAULT '',  -- one per line; '' = defaults
  blind_review         BOOLEAN NOT NULL DEFAULT false,
  decisions_published  BOOLEAN NOT NULL DEFAULT false,
  archived             BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE conference_reviewers (
  conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (conference_id, user_id)
);

CREATE TABLE proposals (
  id                    SERIAL PRIMARY KEY,
  conference_id         INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
  speaker_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  abstract              TEXT NOT NULL,
  format                TEXT NOT NULL DEFAULT '',
  topic                 TEXT NOT NULL DEFAULT '',
  level                 TEXT NOT NULL DEFAULT '',
  co_speakers           TEXT NOT NULL DEFAULT '',
  notes                 TEXT NOT NULL DEFAULT '',
  status                TEXT NOT NULL DEFAULT 'submitted'
                        CHECK (status IN ('submitted', 'accepted', 'waitlisted', 'rejected', 'withdrawn')),
  speaker_confirmation  TEXT NOT NULL DEFAULT ''
                        CHECK (speaker_confirmation IN ('', 'confirmed', 'declined')),
  feedback_to_speaker   TEXT NOT NULL DEFAULT '',
  internal_notes        TEXT NOT NULL DEFAULT '',
  version               INTEGER NOT NULL DEFAULT 1,
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at            TIMESTAMPTZ,
  confirmed_at          TIMESTAMPTZ
);
CREATE INDEX proposals_conference_idx ON proposals (conference_id);
CREATE INDEX proposals_speaker_idx ON proposals (speaker_id);
CREATE INDEX proposals_updated_idx ON proposals (updated_at);

CREATE TABLE reviews (
  id              SERIAL PRIMARY KEY,
  proposal_id     INTEGER NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  reviewer_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score           INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  recommendation  TEXT NOT NULL CHECK (recommendation IN ('accept', 'maybe', 'reject')),
  comments        TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, reviewer_id)
);

CREATE TABLE proposal_history (
  id           SERIAL PRIMARY KEY,
  proposal_id  INTEGER NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  detail       TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX proposal_history_proposal_idx ON proposal_history (proposal_id);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

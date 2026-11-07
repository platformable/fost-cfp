-- Single-use emailed links: password resets and committee invites (later changes add purposes).
-- Only a SHA-256 hash of each link's token is stored. Only adds a table, so it is safe on a live database.

CREATE TABLE email_links (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    TEXT NOT NULL CONSTRAINT email_links_purpose_check CHECK (purpose IN ('password_reset', 'committee_invite')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,  -- organiser who copied the link; NULL when emailed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX email_links_user_purpose_idx ON email_links (user_id, purpose, created_at);

-- Optional Bluesky profile next to LinkedIn, stored as https://bsky.app/profile/<handle>.
-- Only adds a column, so it is safe on a live database.
ALTER TABLE users ADD COLUMN bluesky_profile_url TEXT NOT NULL DEFAULT '';

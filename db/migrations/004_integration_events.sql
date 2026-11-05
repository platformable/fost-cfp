-- Integration events: an outbox of events recorded with each change, webhook endpoints and their
-- deliveries (sent by the separate worker process, npm run worker), and API keys for automations.
-- Only adds tables, so it is safe to apply to a live database.

CREATE TABLE events (
  id          UUID PRIMARY KEY,
  type        TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data        JSONB            -- set to NULL by the 30-day purge once no delivery is pending
);
CREATE INDEX events_type_idx ON events (type, occurred_at);

CREATE TABLE webhook_endpoints (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL CHECK (name <> ''),
  url         TEXT NOT NULL,
  secret      TEXT NOT NULL,
  event_types TEXT[] NOT NULL CHECK (cardinality(event_types) >= 1),
  paused      BOOLEAN NOT NULL DEFAULT false,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE webhook_deliveries (
  id                   SERIAL PRIMARY KEY,
  event_id             UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  endpoint_id          INTEGER NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts             INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at      TIMESTAMPTZ DEFAULT now(),
  last_attempt_at      TIMESTAMPTZ,
  last_response_status INTEGER,
  last_error           TEXT,
  delivered_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX webhook_deliveries_due_idx ON webhook_deliveries (next_attempt_at) WHERE status = 'pending';
CREATE INDEX webhook_deliveries_endpoint_idx ON webhook_deliveries (endpoint_id, created_at DESC);
CREATE INDEX webhook_deliveries_event_idx ON webhook_deliveries (event_id);

CREATE TABLE api_keys (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL CHECK (name <> ''),
  scope        TEXT NOT NULL CHECK (scope IN ('read', 'read-write')),
  prefix       TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);

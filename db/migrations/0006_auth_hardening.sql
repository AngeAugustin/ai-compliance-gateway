-- Authentification renforcée : lockout, refresh tokens, révocation d'accès JWT.

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS auth_refresh_token (
  id          UUID PRIMARY KEY DEFAULT CAST(md5(random()::text || clock_timestamp()::text) AS uuid),
  user_id     UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  user_agent  TEXT,
  ip          TEXT
);

CREATE INDEX IF NOT EXISTS auth_refresh_token_user_idx
  ON auth_refresh_token (user_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_revoked_access (
  jti         TEXT PRIMARY KEY,
  user_id     UUID REFERENCES app_user(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason      TEXT
);

CREATE INDEX IF NOT EXISTS auth_revoked_access_expires_idx
  ON auth_revoked_access (expires_at);

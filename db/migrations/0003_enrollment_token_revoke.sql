-- Révocation des jetons d'enrôlement (obsolètes avant expiration / consommation).

ALTER TABLE enrollment_token
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

ALTER TABLE enrollment_token
  ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES app_user(id);

CREATE INDEX IF NOT EXISTS enrollment_token_active_idx
  ON enrollment_token (created_at DESC)
  WHERE revoked_at IS NULL AND used_at IS NULL;

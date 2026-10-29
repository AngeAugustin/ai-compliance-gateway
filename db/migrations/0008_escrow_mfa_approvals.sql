-- Séquestre chiffré des valeurs masquées, second facteur TOTP, alerte de divergence
-- de décision et double validation des règles BLOCK.

-- -----------------------------------------------------------------------------
-- Séquestre : l'agent chiffre les valeurs masquées avec la clé publique du serveur
-- (ECDH P-256 + AES-256-GCM). La clé privée est chiffrée par VAULT_MASTER_KEY ; seule
-- une levée d'anonymat motivée par un DPO authentifié par second facteur la déchiffre.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vault.escrow_key (
  kid                   TEXT PRIMARY KEY,
  public_jwk            JSONB NOT NULL,
  private_jwk_encrypted BYTEA NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  retired_at            TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS vault.escrow (
  event_id       UUID PRIMARY KEY,
  interaction_id TEXT NOT NULL,
  kid            TEXT NOT NULL REFERENCES vault.escrow_key(kid),
  envelope       JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS escrow_expires_idx ON vault.escrow (expires_at);

ALTER TABLE vault.access_log
  ADD COLUMN IF NOT EXISTS event_id       UUID,
  ADD COLUMN IF NOT EXISTS refusal_reason TEXT,
  ADD COLUMN IF NOT EXISTS client_ip      TEXT;

-- -----------------------------------------------------------------------------
-- Second facteur TOTP (RFC 6238). Le secret est chiffré par VAULT_MASTER_KEY ;
-- totp_last_step empêche le rejeu d'un code déjà accepté.
-- -----------------------------------------------------------------------------

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS totp_secret_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS totp_enabled_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS totp_last_step        BIGINT;

-- -----------------------------------------------------------------------------
-- Alerte : action appliquée par l'agent différente de la décision recalculée.
-- -----------------------------------------------------------------------------

ALTER TABLE security_alert DROP CONSTRAINT IF EXISTS security_alert_alert_type_check;
ALTER TABLE security_alert ADD CONSTRAINT security_alert_alert_type_check
  CHECK (alert_type IN ('AGENT_MISSING','AGENT_TAMPERED','AGENT_RECOVERED','CRITICAL_INTERACTION','INFRA_DEGRADED','DECISION_DIVERGENCE'));

-- -----------------------------------------------------------------------------
-- Double validation : tout changement touchant une règle BLOCK attend l'approbation
-- d'une autre personne que son auteur avant d'être appliqué.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS policy_change_request (
  id             UUID PRIMARY KEY DEFAULT CAST(md5(random()::text || clock_timestamp()::text) AS uuid),
  policy_id      UUID REFERENCES policy(id) ON DELETE SET NULL,
  operation      TEXT NOT NULL CHECK (operation IN ('CREATE','UPDATE','DELETE')),
  payload        JSONB,
  -- Version de la règle vue par l'auteur ; l'approbation est refusée si elle a changé depuis.
  base_version   INTEGER,
  requested_by   UUID NOT NULL REFERENCES app_user(id),
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by    UUID REFERENCES app_user(id),
  reviewed_at    TIMESTAMPTZ,
  review_comment TEXT,
  CHECK (reviewed_by IS NULL OR reviewed_by <> requested_by)
);

CREATE INDEX IF NOT EXISTS policy_change_request_status_idx ON policy_change_request (status, requested_at DESC);

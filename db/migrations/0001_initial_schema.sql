-- =============================================================================
-- AI Compliance Gateway — schéma initial
-- Trois domaines isolés (DAT §14) : transactionnel (public), analytique
-- (analytics), référentiel (reference). Le Vault a son propre schéma (vault),
-- séparé pour permettre un contrôle d'accès distinct (DAT §10.2, §13).
-- =============================================================================

-- UUID généré sans pgcrypto (extension parfois indisponible sous Windows).
CREATE SCHEMA IF NOT EXISTS reference;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS vault;

-- -----------------------------------------------------------------------------
-- Domaine référentiel
-- -----------------------------------------------------------------------------

CREATE TABLE reference.regulatory_framework (
  id                       TEXT PRIMARY KEY,
  name                     TEXT NOT NULL,
  description              TEXT,
  applicable_jurisdictions TEXT[] NOT NULL DEFAULT '{}',
  -- Correspondance composant -> références (DAT §23), ex. {"detection_engine": ["OWASP-LLM02", "MALABO-ART14"]}
  component_references     JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active                BOOLEAN NOT NULL DEFAULT FALSE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un seul référentiel actif à la fois par déploiement (FR-12)
CREATE UNIQUE INDEX regulatory_framework_single_active
  ON reference.regulatory_framework ((is_active)) WHERE is_active;

CREATE TABLE reference.ai_service (
  id             TEXT PRIMARY KEY,               -- domaine canonique, ex. chatgpt.com
  name           TEXT NOT NULL,
  hosting_region TEXT NOT NULL,                  -- code pays / région ISO (US, EU, CN, ...)
  risk_baseline  SMALLINT NOT NULL DEFAULT 20 CHECK (risk_baseline BETWEEN 0 AND 100),
  free_access    BOOLEAN NOT NULL DEFAULT TRUE,
  -- Domaines surveillés par l'extension (A1) et commandes CLI interceptées par le shim (A2)
  domains        TEXT[] NOT NULL DEFAULT '{}',
  cli_commands   TEXT[] NOT NULL DEFAULT '{}',
  enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reference.department (
  name               TEXT PRIMARY KEY,
  -- Niveau de risque historique utilisé pour la politique fail-open/fail-closed graduée (DAT §11.2)
  risk_history_level TEXT NOT NULL DEFAULT 'moderate' CHECK (risk_history_level IN ('low','moderate','high')),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Domaine transactionnel
-- -----------------------------------------------------------------------------

CREATE TABLE app_user (
  id             UUID PRIMARY KEY DEFAULT CAST(md5(random()::text || clock_timestamp()::text) AS uuid),
  sso_ref        TEXT UNIQUE,
  email          TEXT NOT NULL UNIQUE,
  display_name   TEXT NOT NULL,
  -- Authentification locale du pilote ; remplacée par SSO/OIDC en production (DAT §7.2)
  password_hash  TEXT,
  department     TEXT NOT NULL REFERENCES reference.department(name),
  role           TEXT NOT NULL CHECK (role IN ('USER','RSSI','DPO','ADMIN')),
  jurisdiction   TEXT NOT NULL DEFAULT 'BJ',
  mfa_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE policy (
  id                   UUID PRIMARY KEY DEFAULT CAST(md5(random()::text || clock_timestamp()::text) AS uuid),
  name                 TEXT NOT NULL,
  description          TEXT,
  -- DSL déclarative condition -> action (DAT §10.1)
  condition_expr       TEXT NOT NULL,
  action               TEXT NOT NULL CHECK (action IN ('ALLOW','WARN','MASK','BLOCK')),
  priority             INTEGER NOT NULL DEFAULT 100,   -- plus petit = évalué en premier
  version              INTEGER NOT NULL DEFAULT 1,
  enabled              BOOLEAN NOT NULL DEFAULT TRUE,
  reference_frameworks TEXT[] NOT NULL DEFAULT '{}',
  created_by           UUID REFERENCES app_user(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX policy_enabled_priority_idx ON policy (enabled, priority);

-- Historique versionné des politiques (DAT §7.2 Policy Manager)
CREATE TABLE policy_version (
  policy_id            UUID NOT NULL REFERENCES policy(id) ON DELETE CASCADE,
  version              INTEGER NOT NULL,
  name                 TEXT NOT NULL,
  condition_expr       TEXT NOT NULL,
  action               TEXT NOT NULL,
  priority             INTEGER NOT NULL,
  enabled              BOOLEAN NOT NULL,
  reference_frameworks TEXT[] NOT NULL,
  changed_by           UUID REFERENCES app_user(id),
  changed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (policy_id, version)
);

CREATE TABLE risk_factor_weight (
  factor_name    TEXT PRIMARY KEY CHECK (factor_name IN ('entity_sensitivity','quasi_identifier_combination','hosting_location','organizational_context')),
  weight         NUMERIC(5,4) NOT NULL CHECK (weight >= 0 AND weight <= 1),
  effective_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by     UUID REFERENCES app_user(id)
);

CREATE TABLE risk_band_threshold (
  band      TEXT PRIMARY KEY CHECK (band IN ('low','moderate','high','critical')),
  min_score SMALLINT NOT NULL CHECK (min_score BETWEEN 0 AND 100),
  max_score SMALLINT NOT NULL CHECK (max_score BETWEEN 0 AND 100)
);

-- Journal administratif : toute modification de politique / pondération / seuil est tracée (DAT §9, NFR-07)
CREATE TABLE admin_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    UUID REFERENCES app_user(id),
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  before      JSONB,
  after       JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Agents endpoint (DAT §11)
-- -----------------------------------------------------------------------------

CREATE TABLE agent (
  agent_id              UUID PRIMARY KEY DEFAULT CAST(md5(random()::text || clock_timestamp()::text) AS uuid),
  module                TEXT NOT NULL CHECK (module IN ('A1','A2')),
  user_id               UUID REFERENCES app_user(id),
  hostname              TEXT,
  agent_version         TEXT,
  -- Clé publique Ed25519 (base64) utilisée pour vérifier la signature des heartbeats et des événements
  public_key            TEXT NOT NULL,
  enrolled_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat_at     TIMESTAMPTZ,
  last_sequence         BIGINT NOT NULL DEFAULT 0,
  integrity_status      TEXT NOT NULL DEFAULT 'unknown' CHECK (integrity_status IN ('unknown','ok','degraded','missing','tampered','revoked')),
  last_integrity_report JSONB,
  revoked_at            TIMESTAMPTZ
);

CREATE INDEX agent_last_heartbeat_idx ON agent (last_heartbeat_at) WHERE revoked_at IS NULL;

CREATE TABLE enrollment_token (
  token_hash  CHAR(64) PRIMARY KEY,
  module      TEXT NOT NULL CHECK (module IN ('A1','A2')),
  user_id     UUID REFERENCES app_user(id),
  created_by  UUID REFERENCES app_user(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  agent_id    UUID REFERENCES agent(agent_id)
);

CREATE TABLE security_alert (
  id              UUID PRIMARY KEY DEFAULT CAST(md5(random()::text || clock_timestamp()::text) AS uuid),
  alert_type      TEXT NOT NULL CHECK (alert_type IN ('AGENT_MISSING','AGENT_TAMPERED','AGENT_RECOVERED','CRITICAL_INTERACTION','INFRA_DEGRADED')),
  severity        TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  agent_id        UUID REFERENCES agent(agent_id),
  event_id        UUID,
  message         TEXT NOT NULL,
  details         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES app_user(id)
);

CREATE INDEX security_alert_open_idx ON security_alert (created_at DESC) WHERE acknowledged_at IS NULL;

-- -----------------------------------------------------------------------------
-- Vault d'anonymisation (schéma isolé, chiffré AES-256-GCM, DAT §10.2)
-- Aucune valeur en clair : original_value_encrypted contient IV || tag || ciphertext.
-- -----------------------------------------------------------------------------

CREATE TABLE vault.anonymization_mapping (
  token_id                 TEXT PRIMARY KEY,               -- ex. PERSONNE_001@<interaction>
  interaction_id           UUID NOT NULL,
  entity_type              TEXT NOT NULL,
  original_value_encrypted BYTEA NOT NULL,
  key_version              SMALLINT NOT NULL DEFAULT 1,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at               TIMESTAMPTZ NOT NULL
);

CREATE INDEX anonymization_mapping_interaction_idx ON vault.anonymization_mapping (interaction_id);
CREATE INDEX anonymization_mapping_expires_idx ON vault.anonymization_mapping (expires_at);

-- Chaque accès en lecture (dé-tokenisation) est journalisé (DAT §10.2)
CREATE TABLE vault.access_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    UUID,
  token_id    TEXT,
  interaction_id UUID,
  purpose     TEXT NOT NULL,
  granted     BOOLEAN NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Domaine analytique — journal chaîné, append-only (DAT §12, §13)
-- Ne contient jamais de valeur sensible : uniquement des catégories d'entités.
-- -----------------------------------------------------------------------------

CREATE TABLE analytics.security_event (
  event_id             UUID PRIMARY KEY,
  sequence             BIGSERIAL UNIQUE,
  occurred_at          TIMESTAMPTZ NOT NULL,
  user_id_hash         CHAR(64) NOT NULL,
  department           TEXT NOT NULL,
  agent_id             UUID,
  channel              TEXT NOT NULL CHECK (channel IN ('browser','cli','api')),
  ai_service_id        TEXT,
  hosting_region       TEXT,
  entities_detected    TEXT[] NOT NULL,
  entity_counts        JSONB NOT NULL DEFAULT '{}'::jsonb,
  context_category     TEXT,
  risk_score           SMALLINT NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  risk_band            TEXT NOT NULL CHECK (risk_band IN ('low','moderate','high','critical')),
  factor_breakdown     JSONB NOT NULL DEFAULT '[]'::jsonb,
  policy_id            UUID,
  action               TEXT NOT NULL CHECK (action IN ('ALLOW','WARN','MASK','BLOCK')),
  reference_frameworks TEXT[] NOT NULL DEFAULT '{}',
  degraded_mode        BOOLEAN NOT NULL DEFAULT FALSE,
  processing_time_ms   INTEGER,
  detection_layers     TEXT[] NOT NULL DEFAULT '{}',
  prev_event_hash      CHAR(64),
  event_hash           CHAR(64) NOT NULL
);

CREATE INDEX security_event_occurred_idx   ON analytics.security_event (occurred_at DESC);
CREATE INDEX security_event_action_idx     ON analytics.security_event (action, occurred_at DESC);
CREATE INDEX security_event_department_idx ON analytics.security_event (department, occurred_at DESC);
CREATE INDEX security_event_service_idx    ON analytics.security_event (ai_service_id, occurred_at DESC);
CREATE INDEX security_event_agent_idx      ON analytics.security_event (agent_id, occurred_at DESC);

-- Append-only : interdiction de UPDATE / DELETE au niveau base (contre-mesure Tampering / Repudiation)
CREATE OR REPLACE FUNCTION analytics.reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'analytics.security_event is append-only (%)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER security_event_no_update
  BEFORE UPDATE OR DELETE ON analytics.security_event
  FOR EACH ROW EXECUTE FUNCTION analytics.reject_mutation();

-- Hypertable TimescaleDB si l'extension est disponible (DAT §16) ; sinon PostgreSQL pur (pilote).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb') THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS timescaledb';
    PERFORM create_hypertable('analytics.security_event', 'occurred_at', if_not_exists => TRUE, migrate_data => TRUE);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'TimescaleDB non activé : %', SQLERRM;
END $$;

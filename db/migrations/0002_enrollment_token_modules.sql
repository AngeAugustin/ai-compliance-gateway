-- Jeton d'enrôlement multi-modules : un même jeton peut couvrir Extension (A1) et Terminal (A2).
-- Chaque module est consommé une fois (une ligne agent par module).

ALTER TABLE enrollment_token
  ADD COLUMN IF NOT EXISTS modules TEXT[];

UPDATE enrollment_token
   SET modules = ARRAY[module]
 WHERE modules IS NULL;

ALTER TABLE enrollment_token
  ALTER COLUMN modules SET NOT NULL;

ALTER TABLE enrollment_token
  DROP CONSTRAINT IF EXISTS enrollment_token_module_check;

ALTER TABLE enrollment_token
  DROP COLUMN IF EXISTS module;

ALTER TABLE enrollment_token
  DROP CONSTRAINT IF EXISTS enrollment_token_modules_check;

ALTER TABLE enrollment_token
  ADD CONSTRAINT enrollment_token_modules_check
  CHECK (
    modules <@ ARRAY['A1','A2']::text[]
    AND cardinality(modules) >= 1
  );

CREATE TABLE IF NOT EXISTS enrollment_token_redemption (
  token_hash   CHAR(64) NOT NULL REFERENCES enrollment_token(token_hash) ON DELETE CASCADE,
  module       TEXT NOT NULL CHECK (module IN ('A1','A2')),
  agent_id     UUID NOT NULL REFERENCES agent(agent_id),
  redeemed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (token_hash, module)
);

CREATE INDEX IF NOT EXISTS enrollment_token_redemption_agent_idx
  ON enrollment_token_redemption (agent_id);

-- Adresse IP vue par le serveur (enrôlement + heartbeats).

ALTER TABLE agent
  ADD COLUMN IF NOT EXISTS last_ip TEXT;

CREATE INDEX IF NOT EXISTS agent_last_ip_idx ON agent (last_ip) WHERE revoked_at IS NULL;

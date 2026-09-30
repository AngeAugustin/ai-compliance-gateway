-- Adresse IP source de l'interaction (journal d'audit).

ALTER TABLE analytics.security_event
  ADD COLUMN IF NOT EXISTS client_ip TEXT;

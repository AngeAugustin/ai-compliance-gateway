-- Identifiant d'interaction fourni par l'agent : rend la journalisation idempotente.
-- Un agent qui n'a pas reçu la réponse (connexion coupée après l'écriture) renvoie
-- l'événement depuis sa file ; le serveur reconnaît l'identifiant et ne l'écrit pas deux fois.
-- NULL pour les événements antérieurs. Hors du hachage chaîné : les chaînes existantes
-- restent vérifiables.

ALTER TABLE analytics.security_event
  ADD COLUMN IF NOT EXISTS interaction_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS security_event_interaction_uidx
  ON analytics.security_event (interaction_id)
  WHERE interaction_id IS NOT NULL;

-- Décision recalculée par le serveur, conservée à côté de l'action réellement appliquée
-- sur le poste (colonne action). NULL quand l'agent n'a pas transmis de décision locale
-- (inspection depuis le dashboard) : action est alors la décision serveur.

ALTER TABLE analytics.security_event
  ADD COLUMN IF NOT EXISTS server_decision JSONB;

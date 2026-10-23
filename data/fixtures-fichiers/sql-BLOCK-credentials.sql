-- Script d'initialisation — NE JAMAIS COMMITTER
-- password = SuperSecret99!
-- api_key: sk-abcdefghijklmnopqrstuvwxyz012345

CREATE ROLE cnss_app LOGIN PASSWORD 'CnssApp#2026';
GRANT ALL ON DATABASE cotisations TO cnss_app;

-- Connexion de la réplique de lecture
-- postgres://cnss:P@ssw0rd@10.0.0.5:5432/cotisations

ALTER ROLE cnss_report SET search_path = reporting, public;

-- Extrait de sauvegarde — base de test (données fictives)
-- Table assure : identifiants CNSS et contacts

INSERT INTO assure (num_cnss, nom, email, agence) VALUES
  ('cnss A12345678', 'Agbodji', 'marie.agbodji@cnss.bj', 'Agence centrale'),
  ('cnss C77889900', 'Mensah', 'koffi.mensah@cnss.bj', 'Agence nord'),
  ('cnss B99887766', 'Bello', 'aicha.bello@cnss.bj', 'Agence centrale'),
  ('cnss D55443322', 'Houngbedji', 'rodrigue.houngbedji@cnss.bj', 'Agence sud');

INSERT INTO identite (num_cnss, npi) VALUES
  ('cnss A12345678', 'NPI : BJ19880312A45'),
  ('cnss C77889900', 'NPI : BJ19750921K08');

-- Fin de l'extrait

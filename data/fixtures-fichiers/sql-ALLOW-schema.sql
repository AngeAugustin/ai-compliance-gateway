-- Schéma de référence (structure seule, sans données personnelles)

CREATE TABLE reference_pays (
  code CHAR(2) PRIMARY KEY,
  libelle VARCHAR(100) NOT NULL
);

CREATE TABLE reference_agence (
  id SERIAL PRIMARY KEY,
  libelle VARCHAR(120) NOT NULL,
  code_pays CHAR(2) NOT NULL REFERENCES reference_pays(code),
  ouverte BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE reference_branche (
  code VARCHAR(10) PRIMARY KEY,
  libelle VARCHAR(120) NOT NULL,
  taux_patronal NUMERIC(5,2) NOT NULL,
  taux_salarial NUMERIC(5,2) NOT NULL
);

CREATE INDEX idx_pays_libelle ON reference_pays(libelle);
CREATE INDEX idx_agence_pays ON reference_agence(code_pays);

COMMENT ON TABLE reference_branche IS 'Branches de prestations : famille, vieillesse, risques professionnels';

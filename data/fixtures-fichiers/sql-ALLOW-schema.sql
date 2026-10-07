-- Schéma générique (sans données personnelles)
CREATE TABLE reference_pays (
  code CHAR(2) PRIMARY KEY,
  libelle VARCHAR(100) NOT NULL
);
CREATE INDEX idx_pays_libelle ON reference_pays(libelle);

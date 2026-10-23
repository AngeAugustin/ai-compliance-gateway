/**
 * Génère le jeu de fixtures pour tests manuels (Inspect / A1 / A2) et E2E.
 * Usage : pnpm fixtures:fichiers
 *
 * Toutes les personnes, numéros et secrets sont FICTIFS (données synthétiques).
 * Le préfixe du nom de fichier donne l'action attendue (ALLOW / MASK / BLOCK) ;
 * `packages/agent-runtime/src/fixtures-actions.test.ts` vérifie qu'elle est tenue.
 *
 * Règles de construction :
 * - ALLOW : aucun identifiant, montant, contact ni secret.
 * - MASK  : identifiants CNSS / NPI + contacts, mais au plus deux types de
 *           quasi-identifiants (au-delà, le score bascule en bande critique → BLOCK).
 * - BLOCK : au moins un secret technique ou une donnée médicale.
 * - PDF   : ASCII uniquement, une valeur sensible par ligne (réécriture binaire).
 */
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { zipStore } from "../../packages/file-extract/src/extractors/pptx-zip.js";

const root = dirname(fileURLToPath(import.meta.url));
const enc = new TextEncoder();

// —— Valeurs fictives partagées (reprises par les tests E2E et les guides) ——
const API_KEY = "sk-abcdefghijklmnopqrstuvwxyz012345";
const DB_URL = "postgres://cnss:P@ssw0rd@10.0.0.5:5432/cotisations";

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** PDF texte simple, une ligne par entrée, offsets xref exacts. ASCII uniquement. */
function textPdf(lines: string[]): string {
  const ops = lines
    .map((l, i) => {
      const safe = l.replace(/[\\()]/g, "").replace(/[^\x20-\x7e]/g, "");
      return `${i === 0 ? "50 760 Td" : "0 -16 Td"} (${safe}) Tj`;
    })
    .join("\n");
  const stream = `BT /F1 11 Tf\n${ops}\nET`;
  const objects = [
    "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n",
    "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n",
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n",
    `4 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream endobj\n`,
    "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(body.length);
    body += obj;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) body += `${String(o).padStart(10, "0")} 00000 n \n`;
  body += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return body;
}

function docx(paragraphs: string[]): Uint8Array {
  const body = paragraphs.map((t) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(t)}</w:t></w:r></w:p>`).join("");
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  return zipStore({
    "[Content_Types].xml": enc.encode(contentTypes),
    "_rels/.rels": enc.encode(rels),
    "word/document.xml": enc.encode(documentXml),
  });
}

/** Une diapositive par tableau de lignes. */
function pptx(slides: string[][]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  slides.forEach((lines, i) => {
    const shapes = lines.map((t) => `<p:sp><p:txBody><a:p><a:r><a:t>${escapeXml(t)}</a:t></a:r></a:p></p:txBody></p:sp>`).join("");
    files[`ppt/slides/slide${i + 1}.xml`] = enc.encode(`<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>${shapes}</p:spTree></p:cSld>
</p:sld>`);
  });
  return zipStore(files);
}

async function writeXlsx(path: string, sheets: Record<string, (string | number)[][]>) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  await writeFile(path, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
}

async function main() {
  await mkdir(root, { recursive: true });

  // ————————————————————————————— TXT / MD —————————————————————————————
  await writeFile(
    join(root, "txt-ALLOW-procedure-archivage.txt"),
    `PROCÉDURE INTERNE — ARCHIVAGE DES DOSSIERS ADMINISTRATIFS
Version 3.1 — Direction des Affaires Administratives

1. OBJET
Cette procédure fixe les règles de classement, de conservation et d'élimination
des dossiers administratifs produits par les services.

2. CHAMP D'APPLICATION
Elle s'applique à toutes les directions et à tous les supports : papier,
fichiers bureautiques et documents numérisés.

3. RÔLES
- Le chef de service valide la liste des dossiers à archiver.
- Le correspondant archives prépare les boîtes et le bordereau de versement.
- Le service des archives contrôle, enregistre et range les boîtes.

4. ÉTAPES
4.1 Trier les dossiers clos depuis plus d'un an.
4.2 Retirer les doublons, brouillons et copies de travail.
4.3 Classer par année puis par ordre alphabétique d'intitulé.
4.4 Remplir le bordereau de versement en deux exemplaires.
4.5 Étiqueter chaque boîte : direction, intitulé, années extrêmes.
4.6 Transmettre les boîtes au service des archives le premier lundi du mois.

5. DURÉES DE CONSERVATION
- Correspondance courante : 5 ans
- Pièces comptables : 10 ans
- Procès-verbaux des instances : conservation définitive
- Dossiers de marchés publics : 10 ans après la clôture

6. ÉLIMINATION
L'élimination se fait par broyage, après visa du chef de service et du
service des archives. Un procès-verbal d'élimination est conservé.

7. CONTRÔLE
Un audit interne vérifie chaque année l'application de cette procédure.

Document générique — aucune donnée personnelle.
`,
  );
  await writeFile(
    join(root, "txt-MASK-rappel-cnss.txt"),
    `RELANCE — COTISATIONS SOCIALES IMPAYÉES
Service du Recouvrement

Objet : régularisation des cotisations du premier trimestre

Madame, Monsieur,

Sauf erreur de notre part, les cotisations des assurés ci-dessous restent
impayées à la date du présent courrier.

  - Assuré cnss A12345678 — montant dû : 80 000 FCFA (janvier à mars)
  - Assuré cnss B99887766 — montant dû : 125 500 FCFA (février et mars)
  - Assuré cnss C77889900 — montant dû : 46 000 FCFA (mars)

Nous vous invitons à régulariser la situation sous quinze jours, par
virement ou au guichet de votre agence.

Pour toute question, écrivez au gestionnaire du dossier :
marie.agbodji@cnss.bj

Copie : koffi.mensah@cnss.bj (contrôle employeurs)

Veuillez agréer nos salutations distinguées.
Le Service du Recouvrement
`,
  );
  await writeFile(
    join(root, "txt-BLOCK-medical.txt"),
    `NOTE MÉDICALE — CONFIDENTIEL
Service médical — commission d'invalidité

Dossier soumis pour avis : assuré cnss D55443322

Le diagnostic : diabète de type 2 non contrôlé, compliqué d'une
insuffisance rénale débutante.
Antécédents : hypertension artérielle traitée depuis six ans.

Ordonnance : metformine 1000 mg matin et soir pendant 90 jours,
contrôle de l'hémoglobine glyquée dans trois mois.

Avis du médecin-conseil : arrêt de travail prolongé de 60 jours,
réévaluation en commission au prochain trimestre.

Document couvert par le secret médical — diffusion interdite.
`,
  );
  await writeFile(
    join(root, "md-ALLOW-checklist-qualite.md"),
    `# Checklist qualité avant mise en production

## Code
- [ ] Revue de code faite par un second développeur
- [ ] Aucune alerte bloquante de l'analyse statique
- [ ] Dépendances à jour et sans vulnérabilité critique connue

## Tests
- [ ] Tests unitaires verts
- [ ] Tests de bout en bout sur l'environnement de recette
- [ ] Test de charge sur les écrans les plus utilisés

## Sécurité
- [ ] Aucun secret dans le dépôt (variables d'environnement uniquement)
- [ ] Journalisation sans données personnelles
- [ ] Droits d'accès vérifiés par profil

## Exploitation
- [ ] Procédure de retour arrière rédigée et testée
- [ ] Sauvegarde vérifiée avant la mise en production
- [ ] Supervision et alertes configurées

## Documentation
- [ ] Notes de version publiées
- [ ] Guide utilisateur mis à jour
- [ ] Équipe support informée

Aucun identifiant ni secret dans ce fichier.
`,
  );

  // ————————————————————————————— CSV —————————————————————————————
  await writeFile(
    join(root, "csv-ALLOW-themes.csv"),
    `theme,description,public,duree_heures
Archivage,Procédure interne de classement et de conservation,Agents administratifs,3
Formation,Module d'accueil des nouveaux agents,Nouveaux arrivants,7
Qualité,Démarche d'amélioration continue des processus,Chefs de service,4
Sécurité informatique,Bonnes pratiques mots de passe et hameçonnage,Tous les agents,2
Relation usager,Accueil au guichet et traitement des réclamations,Agents d'accueil,6
Bureautique,Tableur niveau intermédiaire,Agents administratifs,7
Communication,Rédaction de courriers administratifs,Secrétariats,4
`,
  );
  await writeFile(
    join(root, "csv-MASK-assures.csv"),
    `nom,prenom,numero_cnss,email,statut
Agbodji,Marie,cnss A12345678,marie.agbodji@cnss.bj,Actif
Mensah,Koffi,cnss B99887766,koffi.mensah@cnss.bj,Actif
Bello,Aïcha,cnss C77889900,aicha.bello@cnss.bj,Suspendu
Houngbédji,Rodrigue,cnss D55443322,rodrigue.houngbedji@cnss.bj,Actif
Dossou,Fatou,cnss E11223344,fatou.dossou@cnss.bj,Radié
`,
  );
  await writeFile(
    join(root, "csv-BLOCK-secrets.csv"),
    `service,environnement,identifiant,secret
openai,production,svc-chatbot,${API_KEY}
postgres,production,cnss_app,password=CnssAdmin#2026!
github,ci,deploy-bot,ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8
aws,sauvegardes,backup-s3,AKIAIOSFODNN7EXAMPLE
smtp,production,notifications,password=Mail2026!Cnss
`,
  );

  // ————————————————————————————— SQL —————————————————————————————
  await writeFile(
    join(root, "sql-ALLOW-schema.sql"),
    `-- Schéma de référence (structure seule, sans données personnelles)

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
`,
  );
  await writeFile(
    join(root, "sql-MASK-backup.sql"),
    `-- Extrait de sauvegarde — base de test (données fictives)
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
`,
  );
  await writeFile(
    join(root, "sql-BLOCK-credentials.sql"),
    `-- Script d'initialisation — NE JAMAIS COMMITTER
-- password = SuperSecret99!
-- api_key: ${API_KEY}

CREATE ROLE cnss_app LOGIN PASSWORD 'CnssApp#2026';
GRANT ALL ON DATABASE cotisations TO cnss_app;

-- Connexion de la réplique de lecture
-- ${DB_URL}

ALTER ROLE cnss_report SET search_path = reporting, public;
`,
  );

  // ————————————————————————————— JSON —————————————————————————————
  await writeFile(
    join(root, "json-ALLOW-menu.json"),
    JSON.stringify(
      {
        application: "Portail RH",
        version: "1.2.0",
        langues: ["fr", "en"],
        menus: [
          { libelle: "Accueil", route: "/" },
          { libelle: "Congés", route: "/conges", sousMenus: ["Demander", "Historique", "Soldes"] },
          { libelle: "Formation", route: "/formation", sousMenus: ["Catalogue", "Mes inscriptions"] },
          { libelle: "Documents", route: "/documents", sousMenus: ["Notes de service", "Procédures"] },
          { libelle: "Aide", route: "/aide" },
        ],
        theme: { couleurPrincipale: "#0B5D3B", mode: "clair" },
        fonctionnalites: { notifications: true, exportPdf: true, signatureElectronique: false },
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(root, "json-MASK-dossier.json"),
    JSON.stringify(
      {
        dossier: "Cotisations T1 2026",
        agence: "Agence centrale",
        assure: {
          numero_cnss: "cnss A12345678",
          email: "marie.agbodji@cnss.bj",
          npi: "NPI : BJ19880312A45",
          mobile_money: "MoMo 01 97 12 34 56",
        },
        employeur: {
          reference: "employeur cnss E4455667",
          raison_sociale: "SARL Démo Services",
        },
        echeances: [
          { periode: "janvier", montant: "800 000 FCFA", statut: "payée" },
          { periode: "février", montant: "850 000 FCFA", statut: "payée" },
          { periode: "mars", montant: "850 000 FCFA", statut: "impayée" },
        ],
        montant_fcfa: "2 500 000 FCFA",
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(root, "json-BLOCK-secrets.json"),
    JSON.stringify(
      {
        environnement: "production",
        openai: { api_key: API_KEY, modele: "gpt-4o" },
        database: { url: DB_URL, pool: 20 },
        github: { token: "ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8" },
        smtp: { hote: "smtp.interne.local", password: "Mail2026!Cnss" },
      },
      null,
      2,
    ),
  );

  // ————————————————————————————— ENV —————————————————————————————
  await writeFile(
    join(root, "env-ALLOW-public.env"),
    `# Configuration publique de démonstration (aucun secret)
APP_NAME=AI Compliance Gateway
APP_ENV=demo
APP_LOCALE=fr
LOG_LEVEL=info
LOG_FORMAT=json
HTTP_PORT=8080
REQUEST_TIMEOUT_MS=15000
FEATURE_EXPORT_PDF=true
FEATURE_DARK_MODE=false
PAGINATION_DEFAULT_SIZE=25
`,
  );
  await writeFile(
    join(root, "env-BLOCK-config.env"),
    `# Configuration production — NE PAS DIFFUSER
APP_ENV=production
API_URL=https://api.openai.com/v1
OPENAI_API_KEY=${API_KEY}
DATABASE_URL=${DB_URL}
REDIS_URL=redis://:R3dis2026@10.0.0.7:6379/0
GITHUB_TOKEN=ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8
SMTP_PASSWORD=Mail2026!Cnss
`,
  );

  // ————————————————————————————— Excel —————————————————————————————
  await writeXlsx(join(root, "xlsx-ALLOW-planning.xlsx"), {
    Planning: [
      ["Semaine", "Activité", "Service", "Statut"],
      ["S12", "Formation des nouveaux agents", "Ressources humaines", "Planifié"],
      ["S13", "Revue des procédures d'archivage", "Affaires administratives", "Planifié"],
      ["S14", "Atelier sécurité informatique", "Systèmes d'information", "En préparation"],
      ["S15", "Inventaire du mobilier", "Logistique", "Planifié"],
      ["S16", "Comité qualité trimestriel", "Direction générale", "À confirmer"],
      ["S17", "Mise à jour du guide d'accueil", "Communication", "Planifié"],
    ],
    Ressources: [
      ["Salle", "Capacité", "Équipement"],
      ["Salle A", 20, "Vidéoprojecteur"],
      ["Salle B", 12, "Écran interactif"],
      ["Auditorium", 80, "Sonorisation"],
    ],
  });
  await writeXlsx(join(root, "xlsx-MASK-cotisations.xlsx"), {
    Cotisations: [
      ["Employeur", "N° employeur", "Période", "Montant dû", "Contact"],
      ["SARL Demo", "employeur cnss E4455667", "T1", "15 000 000 FCFA", "finance@demo.bj"],
      ["SAS Test", "employeur cnss E1122334", "T1", "3 200 000 FCFA", "paie@test.bj"],
      ["ETS Exemple", "employeur cnss E9988776", "T1", "740 000 FCFA", "rh@exemple.bj"],
      ["SA Fictive", "employeur cnss E5566778", "T1", "9 150 000 FCFA", "compta@fictive.bj"],
    ],
    Relances: [
      ["N° employeur", "Relance", "Montant restant"],
      ["employeur cnss E1122334", "1re relance", "1 600 000 FCFA"],
      ["employeur cnss E9988776", "Mise en demeure", "740 000 FCFA"],
    ],
  });
  await writeXlsx(join(root, "xlsx-BLOCK-secrets.xlsx"), {
    Secrets: [
      ["Service", "Environnement", "Secret"],
      ["OpenAI", "production", API_KEY],
      ["Vault", "production", "password = S3cretVault!!"],
      ["Base cotisations", "production", DB_URL],
      ["GitHub", "CI", "ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"],
    ],
  });

  // ————————————————————————————— Word —————————————————————————————
  await writeFile(
    join(root, "docx-ALLOW-note-interne.docx"),
    docx([
      "NOTE DE SERVICE",
      "Objet : organisation de la réunion hebdomadaire de coordination",
      "La réunion de coordination se tient chaque mardi à 9 h en salle A. Elle dure une heure au maximum.",
      "Ordre du jour type :",
      "1. Suivi du planning de la semaine et des échéances.",
      "2. Indicateurs de qualité de service (délais de traitement, réclamations).",
      "3. Points ouverts et arbitrages à remonter à la direction.",
      "4. Questions diverses.",
      "Chaque chef de service transmet ses points la veille avant 16 h au secrétariat de direction.",
      "Le compte rendu est diffusé dans les 48 heures sur l'espace documentaire interne.",
      "Aucune donnée personnelle dans ce document.",
    ]),
  );
  await writeFile(
    join(root, "docx-MASK-rappel-assure.docx"),
    docx([
      "RAPPEL DE COTISATIONS",
      "Assuré CNSS A12345678 — dossier suivi par l'agence centrale",
      "Madame, Monsieur,",
      "Nous constatons un retard de paiement sur vos cotisations volontaires du premier trimestre.",
      "Montant dû : 80 000 FCFA pour le trimestre, majorations de retard non comprises.",
      "Vous pouvez régler par mobile money (MoMo 01 97 12 34 56) en indiquant votre numéro d'assuré en référence.",
      "Votre numéro d'identification : NPI : BJ19880312A45",
      "Pour toute réclamation, contactez votre gestionnaire : marie.agbodji@cnss.bj",
      "Sans régularisation sous 30 jours, le dossier sera transmis au service du contentieux.",
      "Le Service du Recouvrement",
    ]),
  );
  await writeFile(
    join(root, "docx-BLOCK-medical.docx"),
    docx([
      "DOSSIER MÉDICAL CONFIDENTIEL",
      "Commission de reconnaissance des maladies professionnelles",
      "Assuré : cnss D55443322",
      "Le diagnostic : hypertension artérielle sévère du patient, avec épisodes de céphalées et de vertiges.",
      "Examens : bilan rénal normal, électrocardiogramme montrant une hypertrophie ventriculaire gauche.",
      "Ordonnance : traitement antihypertenseur à poursuivre, contrôle tensionnel hebdomadaire.",
      "Avis : lien avec l'activité professionnelle non établi, réexamen dans six mois.",
      "Document couvert par le secret médical.",
    ]),
  );

  // ————————————————————————————— PowerPoint —————————————————————————————
  await writeFile(
    join(root, "pptx-ALLOW-presentation-projet.pptx"),
    pptx([
      ["AI Compliance Gateway", "Sécuriser l'usage de l'IA générative au travail"],
      ["Contexte", "Les agents utilisent des assistants IA publics", "Risque de fuite de données vers des services externes"],
      ["Objectifs du prototype", "Détecter les données sensibles avant envoi", "Appliquer une politique : autoriser, avertir, masquer, bloquer", "Tracer sans conserver de données en clair"],
      ["Feuille de route", "Phase 1 : pilote sur deux directions", "Phase 2 : généralisation", "Phase 3 : tableau de bord de pilotage"],
      ["Pas de données personnelles dans cette présentation"],
    ]),
  );
  await writeFile(
    join(root, "pptx-MASK-brief-cnss.pptx"),
    pptx([
      ["Brief recouvrement — semaine 12", "Service du Recouvrement"],
      ["Dossiers prioritaires", "Point assuré CNSS A12345678 — retard T1", "Point assuré CNSS B99887766 — échéancier en cours"],
      ["Employeurs en relance", "employeur cnss E4455667 — 15 000 000 FCFA", "employeur cnss E1122334 — 3 200 000 FCFA"],
      ["Contacts", "Contact marie.agbodji@cnss.bj", "Copie koffi.mensah@cnss.bj"],
    ]),
  );
  await writeFile(
    join(root, "pptx-BLOCK-brief-finance.pptx"),
    pptx([
      ["Brief financier — confidentiel"],
      ["Point fiscal — NPI : BJ19880312A45", "IBAN FR7630006000011234567890189 — 2 500 000 FCFA", "IBAN BJ59BJ0610100100144039000769 — compte de collecte"],
      ["Automatisation des rapprochements", `api_key: ${API_KEY}`, `Base : ${DB_URL}`],
    ]),
  );

  // ————————————————————————————— PDF —————————————————————————————
  await writeFile(
    join(root, "pdf-ALLOW-guide.pdf"),
    textPdf([
      "GUIDE UTILISATEUR - PORTAIL DES SERVICES EN LIGNE",
      "",
      "1. Se connecter avec son identifiant professionnel.",
      "2. Choisir le service dans le menu principal.",
      "3. Remplir le formulaire et joindre les pieces demandees.",
      "4. Verifier le recapitulatif puis valider la demande.",
      "5. Suivre l'avancement dans l'onglet Mes demandes.",
      "",
      "En cas de difficulte, utiliser le formulaire d'assistance du portail.",
      "Ce guide ne contient aucun identifiant sensible.",
    ]),
    "utf8",
  );
  await writeFile(
    join(root, "pdf-MASK-rappel.pdf"),
    textPdf([
      "RAPPEL DE COTISATIONS - SERVICE DU RECOUVREMENT",
      "",
      "Rappel CNSS A12345678 - retard de paiement du premier trimestre",
      "Montant du : 80 000 FCFA",
      "Rappel CNSS B99887766 - echeancier non respecte",
      "Montant du : 125 500 FCFA",
      "",
      "Gestionnaire : marie.agbodji@cnss.bj",
      "Regularisation attendue sous 15 jours.",
    ]),
    "utf8",
  );
  await writeFile(
    join(root, "pdf-BLOCK-secrets.pdf"),
    textPdf([
      "FICHE D'EXPLOITATION - NE PAS DIFFUSER",
      "",
      `Cle API ${API_KEY}`,
      `Base de donnees ${DB_URL}`,
      "password = SuperSecret99!",
      "",
      "Rotation des secrets prevue en fin de trimestre.",
    ]),
    "utf8",
  );

  // ————————————————————————————— ZIP —————————————————————————————
  await writeFile(
    join(root, "zip-ALLOW-docs.zip"),
    zipStore({
      "readme.txt": enc.encode("Archive de documentation générique.\nPas de données personnelles.\n"),
      "notes.md": enc.encode("# Notes\n\nProcédures internes anonymisées.\n\n- Classement annuel\n- Revue trimestrielle\n"),
      "procedures/accueil.txt": enc.encode("Accueil des usagers : saluer, orienter, enregistrer la demande, remettre le récépissé.\n"),
      "procedures/courrier.txt": enc.encode("Courrier entrant : tamponner, enregistrer, distribuer au service dans la journée.\n"),
    }),
  );
  await writeFile(
    join(root, "zip-MASK-export-assures.zip"),
    zipStore({
      "assures.csv": enc.encode(
        "nom,cnss,email\nAgbodji,cnss A12345678,marie.agbodji@cnss.bj\nMensah,cnss B99887766,koffi.mensah@cnss.bj\nBello,cnss C77889900,aicha.bello@cnss.bj\n",
      ),
      "lisezmoi.txt": enc.encode("Export des assurés de l'agence centrale — usage interne.\n"),
    }),
  );
  await writeFile(
    join(root, "zip-BLOCK-export-technique.zip"),
    zipStore({
      "readme.txt": enc.encode("Export technique — ne pas diffuser."),
      "keys/openai.txt": enc.encode(`api_key: ${API_KEY}\n`),
      "config/database.env": enc.encode(`DATABASE_URL=${DB_URL}\n`),
      "config/app.env": enc.encode("APP_ENV=production\nLOG_LEVEL=warn\n"),
    }),
  );

  // Alias numérotés (démos / docs) — toujours synchronisés avec les préfixes format-*
  const numberedAliases: [string, string][] = [
    ["txt-ALLOW-procedure-archivage.txt", "01-ALLOW-procedure-archivage.txt"],
    ["md-ALLOW-checklist-qualite.md", "02-ALLOW-checklist-qualite.md"],
    ["csv-MASK-assures.csv", "03-MASK-assures.csv"],
    ["csv-BLOCK-secrets.csv", "04-BLOCK-secrets.csv"],
    ["sql-MASK-backup.sql", "05-MASK-backup.sql"],
    ["json-MASK-dossier.json", "06-MASK-dossier.json"],
    ["env-BLOCK-config.env", "07-BLOCK-config.env"],
    ["txt-BLOCK-medical.txt", "08-BLOCK-medical.txt"],
    ["xlsx-MASK-cotisations.xlsx", "09-MASK-cotisations.xlsx"],
    ["docx-MASK-rappel-assure.docx", "10-MASK-rappel-assure.docx"],
    ["pptx-BLOCK-brief-finance.pptx", "11-BLOCK-brief-finance.pptx"],
    ["zip-BLOCK-export-technique.zip", "12-BLOCK-export-technique.zip"],
    ["pdf-MASK-rappel.pdf", "13-MASK-rappel.pdf"],
  ];
  for (const [src, dest] of numberedAliases) {
    await copyFile(join(root, src), join(root, dest));
  }

  console.log(`Fixtures écrites dans ${root}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

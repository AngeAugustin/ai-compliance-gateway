/**
 * Génère le jeu de fixtures pour tests manuels (Inspect / A1 / A2).
 * Usage : pnpm fixtures:fichiers
 */
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { zipStore } from "../../packages/file-extract/src/extractors/pptx-zip.js";

const root = dirname(fileURLToPath(import.meta.url));
const enc = new TextEncoder();

function minimalPdf(textLine: string): string {
  const stream = `BT /F1 12 Tf 50 750 Td (${textLine.replace(/[()\\]/g, "")}) Tj ET`;
  return `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length ${stream.length} >>stream
${stream}
endstream endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000365 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
444
%%EOF
`;
}

function minimalDocx(paragraphs: string[]): Uint8Array {
  const body = paragraphs.map((t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`).join("");
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

function minimalPptx(lines: string[]): Uint8Array {
  const texts = lines.map((t) => `<p:sp><p:txBody><a:p><a:t>${t}</a:t></a:p></p:txBody></p:sp>`).join("");
  const slide = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>${texts}</p:spTree></p:cSld>
</p:sld>`;
  return zipStore({ "ppt/slides/slide1.xml": enc.encode(slide) });
}

async function writeXlsx(path: string, rows: (string | number)[][], sheetName: string) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  await writeFile(path, buf);
}

async function main() {
  await mkdir(root, { recursive: true });

  // —— TXT / MD ——
  await writeFile(
    join(root, "txt-ALLOW-procedure-archivage.txt"),
    `Procédure d'archivage des dossiers administratifs

1. Classer les dossiers par année
2. Étiqueter les boîtes d'archives
3. Conserver selon le calendrier de conservation interne

Document générique — aucune donnée personnelle.
`,
  );
  await writeFile(
    join(root, "txt-MASK-rappel-cnss.txt"),
    `Rappel courtois

Le n° assuré CNSS A12345678 a un impayé de cotisations.
Contact : marie.agbodji@cnss.bj
`,
  );
  await writeFile(
    join(root, "txt-BLOCK-medical.txt"),
    `Note médicale — confidentiel

Le diagnostic : diabète de type 2 non contrôlé du patient doit rester interne.
Ordonnance : metformine 1000 mg matin et soir pendant 90 jours.
`,
  );
  await writeFile(
    join(root, "md-ALLOW-checklist-qualite.md"),
    `# Checklist qualité avant mise en production

- [ ] Revue de code
- [ ] Tests unitaires verts
- [ ] Documentation à jour

Aucun identifiant ni secret dans ce fichier.
`,
  );

  // —— CSV ——
  await writeFile(
    join(root, "csv-ALLOW-themes.csv"),
    `theme,description
Archivage,Procédure interne générique
Formation,Module d'accueil nouveaux agents
`,
  );
  await writeFile(
    join(root, "csv-MASK-assures.csv"),
    `nom,prenom,numero_cnss,email
Agbodji,Marie,cnss A12345678,marie.agbodji@cnss.bj
Mensah,Koffi,cnss B99887766,koffi.mensah@cnss.bj
`,
  );
  await writeFile(
    join(root, "csv-BLOCK-secrets.csv"),
    `service,cle
openai,sk-abcdefghijklmnopqrstuvwxyz012345
postgres,password=CnssAdmin#2026!
`,
  );

  // —— SQL ——
  await writeFile(
    join(root, "sql-ALLOW-schema.sql"),
    `-- Schéma générique (sans données personnelles)
CREATE TABLE reference_pays (
  code CHAR(2) PRIMARY KEY,
  libelle VARCHAR(100) NOT NULL
);
CREATE INDEX idx_pays_libelle ON reference_pays(libelle);
`,
  );
  await writeFile(
    join(root, "sql-MASK-backup.sql"),
    `-- Dump synthétique CNSS (données fictives de test)
INSERT INTO assure (num_cnss, email, telephone) VALUES
  ('cnss A12345678', 'marie.agbodji@cnss.bj', '+229 01 97 12 34 56'),
  ('cnss C77889900', 'koffi.mensah@cnss.bj', '+229 01 90 11 22 33');
`,
  );
  await writeFile(
    join(root, "sql-BLOCK-credentials.sql"),
    `-- Ne jamais committer
-- password = SuperSecret99!
-- api_key: sk-abcdefghijklmnopqrstuvwxyz012345
GRANT ALL ON DATABASE cotisations TO cnss_app;
`,
  );

  // —— JSON ——
  await writeFile(
    join(root, "json-ALLOW-menu.json"),
    JSON.stringify(
      {
        application: "Portail RH",
        menus: ["Accueil", "Congés", "Formation"],
        version: "1.2.0",
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
        assure: {
          numero_cnss: "cnss A12345678",
          email: "marie.agbodji@cnss.bj",
          npi: "NPI : BJ19880312A45",
          mobile_money: "MoMo 01 97 12 34 56",
        },
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
        openai: { api_key: "sk-abcdefghijklmnopqrstuvwxyz012345" },
        database: { url: "postgres://cnss:P@ssw0rd@10.0.0.5:5432/cotisations" },
      },
      null,
      2,
    ),
  );

  // —— ENV ——
  await writeFile(
    join(root, "env-ALLOW-public.env"),
    `APP_NAME=AI Compliance Gateway
APP_ENV=demo
LOG_LEVEL=info
`,
  );
  await writeFile(
    join(root, "env-BLOCK-config.env"),
    `API_URL=https://api.openai.com/v1
OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz012345
DATABASE_URL=postgres://cnss:P@ssw0rd@10.0.0.5:5432/cotisations
`,
  );

  // —— Excel ——
  await writeXlsx(
    join(root, "xlsx-ALLOW-planning.xlsx"),
    [
      ["Semaine", "Activité", "Statut"],
      ["S12", "Formation agents", "Planifié"],
      ["S13", "Revue procédures", "Planifié"],
    ],
    "Planning",
  );
  await writeXlsx(
    join(root, "xlsx-MASK-cotisations.xlsx"),
    [
      ["Employeur", "N° employeur", "Montant cotisations FCFA", "Contact"],
      ["SARL Demo", "employeur cnss E4455667", "15 000 000 FCFA", "finance@demo.bj"],
      ["SAS Test", "employeur cnss E1122334", "3 200 000 FCFA", "paie@test.bj"],
    ],
    "Cotisations",
  );
  await writeXlsx(
    join(root, "xlsx-BLOCK-secrets.xlsx"),
    [
      ["Service", "Secret"],
      ["OpenAI", "sk-abcdefghijklmnopqrstuvwxyz012345"],
      ["Vault", "password = S3cretVault!!"],
    ],
    "Secrets",
  );

  // —— Word ——
  await writeFile(
    join(root, "docx-ALLOW-note-interne.docx"),
    minimalDocx([
      "Note de service — organisation de la réunion hebdomadaire.",
      "Ordre du jour : planning, indicateurs, points ouverts.",
      "Aucune donnée personnelle dans ce document.",
    ]),
  );
  await writeFile(
    join(root, "docx-MASK-rappel-assure.docx"),
    minimalDocx([
      "Rappel de cotisations — assuré CNSS A12345678",
      "Contact : marie.agbodji@cnss.bj — MoMo 01 97 12 34 56",
      "Montant dû : 80 000 FCFA pour le trimestre.",
    ]),
  );
  await writeFile(
    join(root, "docx-BLOCK-medical.docx"),
    minimalDocx([
      "Dossier médical confidentiel",
      "Le diagnostic : hypertension artérielle sévère du patient.",
      "Ordonnance : traitement antihypertenseur à poursuivre.",
    ]),
  );

  // —— PowerPoint ——
  await writeFile(
    join(root, "pptx-ALLOW-presentation-projet.pptx"),
    minimalPptx(["AI Compliance Gateway", "Objectifs du prototype", "Pas de données personnelles"]),
  );
  await writeFile(
    join(root, "pptx-MASK-brief-cnss.pptx"),
    minimalPptx(["Point assuré CNSS A12345678", "Contact marie.agbodji@cnss.bj"]),
  );
  await writeFile(
    join(root, "pptx-BLOCK-brief-finance.pptx"),
    minimalPptx([
      "Point fiscal — NPI : BJ19880312A45",
      "IBAN FR7630006000011234567890189 — 2 500 000 FCFA",
      "api_key: sk-abcdefghijklmnopqrstuvwxyz012345",
    ]),
  );

  // —— PDF ——
  await writeFile(join(root, "pdf-ALLOW-guide.pdf"), minimalPdf("Guide utilisateur - aucun identifiant sensible"), "utf8");
  await writeFile(join(root, "pdf-MASK-rappel.pdf"), minimalPdf("Rappel CNSS A12345678 - marie.agbodji@cnss.bj"), "utf8");
  await writeFile(join(root, "pdf-BLOCK-secrets.pdf"), minimalPdf("Cle API sk-abcdefghijklmnopqrstuvwxyz012345"), "utf8");

  // —— ZIP ——
  await writeFile(
    join(root, "zip-ALLOW-docs.zip"),
    zipStore({
      "readme.txt": enc.encode("Archive de documentation générique.\nPas de PII.\n"),
      "notes.md": enc.encode("# Notes\nProcédures internes anonymisées.\n"),
    }),
  );
  await writeFile(
    join(root, "zip-MASK-export-assures.zip"),
    zipStore({
      "assures.csv": enc.encode("nom,cnss\nMarie,cnss A12345678\n"),
    }),
  );
  await writeFile(
    join(root, "zip-BLOCK-export-technique.zip"),
    zipStore({
      "readme.txt": enc.encode("Export technique — ne pas diffuser."),
      "keys/openai.txt": enc.encode("api_key: sk-abcdefghijklmnopqrstuvwxyz012345\n"),
    }),
  );

  // Alias numérotés (démoc / docs) — toujours synchronisés avec les préfixes format-*
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

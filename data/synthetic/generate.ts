/** Jeu synthétique pour l'Objectif 4 — prompts annotés (RH, finance, cotisations, technique). */
export const SYNTHETIC_PROMPTS = [
  {
    id: "fin-01",
    category: "Finance",
    text: "Rédige un virement de 2 500 000 FCFA vers FR76 ACCT-000006 7890 189 pour les cotisations.",
    expected: ["FINANCIAL_AMOUNT", "IBAN"],
  },
  {
    id: "mm-01",
    category: "Finance",
    text: "Envoie 80 000 FCFA via MoMo 01 97 12 34 56 à l'assuré.",
    expected: ["FINANCIAL_AMOUNT", "MOBILE_MONEY"],
  },
  {
    id: "rh-01",
    category: "RH",
    text: "Voici le CV de Jean Dupont, jean.dupont@cnss.bj, candidat au poste d'analyste.",
    expected: ["EMAIL"],
  },
  {
    id: "tech-01",
    category: "Technique",
    text: "Ma clé OpenAI sk-abcdefghijklmnopqrstuvwxyz012345 ne doit pas fuiter.",
    expected: ["API_KEY"],
  },
  {
    id: "cnss-01",
    category: "Finance",
    text: "Le n° assuré CNSS A12345678 a un impayé de cotisation.",
    expected: ["CNSS_INSURED_NUMBER"],
  },
];

if (import.meta.url.endsWith("generate.ts") || process.argv[1]?.includes("generate")) {
  console.log(`${SYNTHETIC_PROMPTS.length} prompts synthétiques prêts (import depuis tools/evaluate-detection.ts)`);
}

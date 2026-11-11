/**
 * LLM de contexte avec le vrai modèle (Phi-3.5-mini GGUF) — `pnpm test:llm`.
 * Hors de `pnpm test` : chargement de 2,4 Go et environ 3 s par prompt sur CPU.
 * Modèle et empreinte lus dans .env (LLM_MODEL_PATH, LLM_MODEL_SHA256) ; sans modèle, le fichier est ignoré.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DetectionEngine } from "./engine.js";
import { LlmLocalLayer } from "./layers/llm-local.js";

loadEnv({ path: resolve(__dirname, "../../../.env"), quiet: true });
const MODEL = process.env.LLM_MODEL_PATH ?? "";

/** Deux demandes sans ambiguïté par catégorie, rédigées pour ce test (hors corpus d'évaluation). */
const CASES: [string, string][] = [
  ["RH", "Rédige la lettre de convocation à l'entretien annuel d'évaluation de l'agent du service courrier."],
  ["RH", "Combien de jours de congés payés reste-t-il à un salarié embauché en mars ?"],
  ["Finance", "Fais le rapprochement entre les factures fournisseurs et les relevés bancaires de septembre."],
  ["Finance", "Prépare le tableau du budget prévisionnel de la direction pour l'exercice prochain."],
  ["Juridique", "Analyse la clause de résiliation de ce contrat de prestation et les risques de litige."],
  ["Juridique", "Quelles obligations le RGPD impose-t-il pour la conservation des données des assurés ?"],
  ["Technique", "Le serveur PostgreSQL refuse les connexions après la mise à jour, comment diagnostiquer ?"],
  ["Technique", "Corrige cette fonction TypeScript qui renvoie undefined quand la liste est vide."],
  ["Medical", "Résume le dossier : patient diabétique, traitement par insuline, suivi de l'hémoglobine glyquée."],
  ["Medical", "Quels examens prescrire après un diagnostic de hernie discale lombaire ?"],
  ["Generique", "Propose trois idées de titre pour la newsletter interne du mois."],
  ["Generique", "Traduis en anglais : la réunion est reportée à jeudi matin."],
];

const enabled = MODEL !== "" && existsSync(MODEL);

describe.skipIf(!enabled)("LLM local — vrai modèle", () => {
  const layer = new LlmLocalLayer({ modelPath: MODEL, expectedSha256: process.env.LLM_MODEL_SHA256 || undefined });
  const times: number[] = [];
  let loadMs = 0;

  beforeAll(async () => {
    const t = performance.now();
    const status = await layer.initialize();
    loadMs = performance.now() - t;
    if (!status.available) throw new Error(`LLM non chargé : ${status.detail}`);
  }, 300_000);

  afterAll(() => {
    const s = [...times].sort((a, b) => a - b);
    const p = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
    console.log(`[llm] chargement ${Math.round(loadMs)} ms · ${s.length} prompts · médiane ${Math.round(p(0.5))} ms · max ${Math.round(s[s.length - 1] ?? 0)} ms`);
  });

  it("empreinte du modèle vérifiée quand elle est fournie", () => {
    const status = layer.integrityReport()?.status;
    expect(process.env.LLM_MODEL_SHA256 ? status === "verified" : status === "unverified").toBe(true);
  });

  it("classe correctement au moins 10 demandes sur 12 sans ambiguïté", async () => {
    const wrong: string[] = [];
    for (const [expected, text] of CASES) {
      const r = await layer.detect(text);
      times.push(r.processingTimeMs);
      expect(r.degraded).toBe(false);
      if (r.context?.contextCategory !== expected) wrong.push(`${expected} → ${r.context?.contextCategory} : ${text.slice(0, 50)}`);
    }
    if (wrong.length) console.log(`[llm] erreurs :\n  ${wrong.join("\n  ")}`);
    expect(CASES.length - wrong.length).toBeGreaterThanOrEqual(10);
  }, 600_000);

  it("réponse déterministe (température 0) : même demande, même catégorie", async () => {
    const text = CASES[6]![1];
    const a = await layer.detect(text);
    const b = await layer.detect(text);
    expect(a.context?.contextCategory).toBe(b.context?.contextCategory);
  }, 120_000);

  it("dans le moteur : mêmes entités qu'avec les lexiques seuls, pas de mode dégradé", async () => {
    const text = "Pour l'assuré Koffi Djossou, verser 96 400 FCFA sur BJ59BJ0610100100144039000769, patient diabétique.";
    const withLlm = new DetectionEngine({ extraLayers: [layer] });
    (withLlm as unknown as { initialized: boolean }).initialized = true;
    const without = new DetectionEngine();
    await without.initialize();
    const a = await withLlm.detect(text);
    const b = await without.detect(text);
    expect(a.degraded).toBe(false);
    expect(a.entities.map((e) => `${e.entityType}:${e.value}`)).toEqual(b.entities.map((e) => `${e.entityType}:${e.value}`));
  }, 120_000);
});

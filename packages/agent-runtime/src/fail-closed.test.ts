/**
 * Fail-closed sur le texte : quand une couche de détection obligatoire est en panne, on ne peut plus
 * garantir que rien ne fuit. Deux protections superposées :
 * 1. la politique « Fail-closed directions à risque » (modifiable par le RSSI) bloque Cotisations,
 *    Finance et Juridique en mode dégradé, quel que soit leur niveau de risque ;
 * 2. un filet dans le code (pipeline.ts), qu'aucune politique ne retire, bloque les directions de
 *    cette liste classées à risque élevé, même si la politique a été supprimée.
 * Les autres directions continuent avec les règles. Une couche facultative absente (LLM de
 * contexte) ne déclenche jamais le blocage.
 */
import { DetectionEngine, type DetectionLayerProvider } from "@acg/detection-engine";
import { LlmLocalLayer } from "@acg/detection-engine/node";
import { describe, expect, it } from "vitest";
import { DecisionCache } from "./cache.js";
import { decideLocally } from "./pipeline.js";

const ANODIN = "Propose trois idées de titre pour la note de service sur le télétravail.";

/** Couche obligatoire en panne (par exemple le NER dont le modèle n'a pas pu être chargé). */
const brokenLayer: DetectionLayerProvider = {
  layer: "ner",
  initialize: async () => ({ layer: "ner", available: false, degraded: true, modelVersion: "ner-unavailable", detail: "modèle absent" }),
  status: () => ({ layer: "ner", available: false, degraded: true, modelVersion: "ner-unavailable", detail: "modèle absent" }),
  detect: async () => ({ layer: "ner", entities: [], processingTimeMs: 0, modelVersion: "ner-unavailable", degraded: true }),
};

const FAIL_CLOSED_POLICY = "Fail-closed directions à risque (bootstrap)";

function cacheFor(department: string, departmentRiskLevel: "low" | "moderate" | "high", withoutFailClosedPolicy = false): DecisionCache {
  const cache = new DecisionCache();
  const snapshot = cache.fallback({ department, departmentRiskLevel, jurisdiction: "BJ", userId: "00000000-0000-4000-8000-000000000020" });
  // Le RSSI peut supprimer la politique : on vérifie alors le filet du code seul.
  if (withoutFailClosedPolicy) snapshot.policies = snapshot.policies.filter((p) => !/degraded_mode/.test(p.conditionExpr));
  cache.hydrate(snapshot);
  return cache;
}

async function decide(opts: { department: string; level: "low" | "moderate" | "high"; engine: DetectionEngine; failClosedDepartments?: string[]; text?: string; withoutPolicy?: boolean }) {
  await opts.engine.initialize();
  return decideLocally({
    promptText: opts.text ?? ANODIN,
    channel: "browser",
    hostnameOrCommand: "chatgpt.com",
    engine: opts.engine,
    cache: cacheFor(opts.department, opts.level, opts.withoutPolicy),
    failClosedDepartments: opts.failClosedDepartments,
  });
}

const degradedEngine = () => new DetectionEngine({ extraLayers: [brokenLayer] });

describe("fail-closed sur le texte", () => {
  it("témoin : moteur sain, prompt anodin en Finance → laissé passer", async () => {
    const d = await decide({ department: "Finance", level: "high", engine: new DetectionEngine() });
    expect(d.degradedMode).toBe(false);
    expect(d.action).not.toBe("BLOCK");
  });

  for (const department of ["Cotisations", "Finance", "Juridique"]) {
    for (const level of ["moderate", "high"] as const) {
      it(`politique : ${department} (risque ${level === "high" ? "élevé" : "modéré"}), détection dégradée → BLOCK, même pour un prompt anodin`, async () => {
        const d = await decide({ department, level, engine: degradedEngine() });
        expect(d.degradedMode).toBe(true);
        expect(d.action).toBe("BLOCK");
        expect(d.decision.policyName).toBe(FAIL_CLOSED_POLICY);
      });
    }
  }

  for (const department of ["Cotisations", "Finance", "Juridique"]) {
    it(`filet du code : politique supprimée, ${department} à risque élevé → BLOCK quand même`, async () => {
      const d = await decide({ department, level: "high", engine: degradedEngine(), withoutPolicy: true });
      expect(d.action).toBe("BLOCK");
      expect(d.decision.escalated).toBe(true);
      expect(d.decision.escalationReason).toMatch(/Fail-closed/);
      expect(d.decision.userMessage).toMatch(/moteur d'analyse/);
    });
  }

  it("politique supprimée et risque modéré : le filet du code ne s'applique pas (choix du RSSI respecté)", async () => {
    const d = await decide({ department: "Finance", level: "moderate", engine: degradedEngine(), withoutPolicy: true });
    expect(d.action).not.toBe("BLOCK");
  });

  it("direction non sensible (Technique), détection dégradée → pas de blocage d'office", async () => {
    const d = await decide({ department: "Technique", level: "moderate", engine: degradedEngine() });
    expect(d.degradedMode).toBe(true);
    expect(d.action).not.toBe("BLOCK");
  });

  it("liste de directions du filet configurable : RH ajoutée → bloquée en mode dégradé", async () => {
    const d = await decide({ department: "RH", level: "high", engine: degradedEngine(), failClosedDepartments: ["RH"], withoutPolicy: true });
    expect(d.action).toBe("BLOCK");
    expect(d.decision.escalationReason).toMatch(/Fail-closed/);
  });

  it("en mode dégradé, les règles continuent de bloquer un secret dans une direction non sensible", async () => {
    const d = await decide({ department: "Technique", level: "moderate", engine: degradedEngine(), text: "Ma clé sk-abcdefghijklmnopqrstuvwxyz012345 ne marche pas." });
    expect(d.action).toBe("BLOCK");
    expect(d.entities.some((e) => e.entityType === "API_KEY")).toBe(true);
  });

  it("LLM de contexte absent (couche facultative) : pas de mode dégradé, pas de blocage en Finance", async () => {
    const engine = new DetectionEngine({ extraLayers: [new LlmLocalLayer({ modelPath: undefined })] });
    const d = await decide({ department: "Finance", level: "high", engine });
    expect(d.degradedMode).toBe(false);
    expect(d.action).not.toBe("BLOCK");
  });
});

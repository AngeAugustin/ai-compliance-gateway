import { describe, expect, it } from "vitest";
import { DetectionEngine } from "@acg/detection-engine";
import { extractOne } from "@acg/file-extract";
import { DEFAULT_AI_SERVICES, DEFAULT_RISK_BAND_THRESHOLDS, DEFAULT_RISK_WEIGHTS } from "@acg/shared";
import { DecisionCache } from "./cache.js";
import { prepareFileAnalysis } from "./files.js";
import { decideLocally } from "./pipeline.js";
import { SEED_EQUIVALENT_POLICIES } from "./e2e-texte.scenarios.js";

function cacheCotisations(): DecisionCache {
  const cache = new DecisionCache();
  cache.hydrate({
    policyVersion: "e2e-files",
    generatedAt: new Date().toISOString(),
    policies: SEED_EQUIVALENT_POLICIES,
    aiServices: DEFAULT_AI_SERVICES.map((s) => ({
      id: s.id,
      name: s.name,
      hostingRegion: s.hostingRegion,
      riskBaseline: s.riskBaseline,
      freeAccess: s.freeAccess,
      domains: s.domains,
      cliCommands: s.cliCommands,
    })),
    riskWeights: { ...DEFAULT_RISK_WEIGHTS },
    riskBandThresholds: { ...DEFAULT_RISK_BAND_THRESHOLDS },
    organization: { jurisdiction: "BJ", regulatoryFrameworkId: "BJ_MALABO" },
    user: {
      userId: "00000000-0000-4000-8000-00000000f001",
      department: "Cotisations",
      departmentRiskLevel: "high",
      jurisdiction: "BJ",
      role: "USER",
    },
    heartbeatIntervalSeconds: 60,
    syncIntervalSeconds: 300,
    expectedModelHashes: {},
  });
  return cache;
}

describe("E2E fichiers", () => {
  it("F-FILE-01 — CSV avec CNSS → MASK", async () => {
    const csv = "assure,numero_cnss\nKoffi,cnss A12345678\n";
    const file = await extractOne({ fileName: "cotisations.csv", data: new TextEncoder().encode(csv) });
    const prepared = await prepareFileAnalysis("Résume ce fichier", [
      { fileName: file.fileName, mimeType: file.mimeType, data: new TextEncoder().encode(csv) },
    ]);
    const engine = new DetectionEngine();
    await engine.initialize();
    const decision = await decideLocally({
      promptText: "Résume ce fichier",
      analysisText: prepared.analysisText,
      extractedFiles: prepared.extracted,
      channel: "browser",
      hostnameOrCommand: "chatgpt.com",
      engine,
      cache: cacheCotisations(),
    });
    expect(decision.action).toBe("MASK");
    expect(decision.attachments).toHaveLength(1);
    expect(decision.attachments[0]!.fileName).toBe("cotisations.csv");
  });

  it("F-FILE-02 — CSV propre + prompt ALLOW → ALLOW", async () => {
    const csv = "theme,description\nProcessus,Archivage interne\n";
    const prepared = await prepareFileAnalysis("Que contient ce fichier ?", [
      { fileName: "readme.csv", data: new TextEncoder().encode(csv) },
    ]);
    const engine = new DetectionEngine();
    await engine.initialize();
    const decision = await decideLocally({
      promptText: "Que contient ce fichier ?",
      analysisText: prepared.analysisText,
      extractedFiles: prepared.extracted,
      channel: "api",
      hostnameOrCommand: "chatgpt.com",
      engine,
      cache: cacheCotisations(),
    });
    expect(decision.action).toBe("ALLOW");
  });

  it("F-FILE-03 — secret dans CSV → BLOCK", async () => {
    const csv = "config,cle\nopenai,sk-abcdefghijklmnopqrstuvwxyz012345\n";
    const prepared = await prepareFileAnalysis("Importe", [
      { fileName: "secrets.csv", data: new TextEncoder().encode(csv) },
    ]);
    const engine = new DetectionEngine();
    await engine.initialize();
    const decision = await decideLocally({
      promptText: "Importe",
      analysisText: prepared.analysisText,
      extractedFiles: prepared.extracted,
      channel: "cli",
      hostnameOrCommand: "claude",
      engine,
      cache: cacheCotisations(),
    });
    expect(decision.action).toBe("BLOCK");
    expect(decision.blockAttachments).toBe(true);
  });
});

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { DetectionEngine } from "@acg/detection-engine";
import { DEFAULT_AI_SERVICES, DEFAULT_RISK_BAND_THRESHOLDS, DEFAULT_RISK_WEIGHTS, type PolicyAction } from "@acg/shared";
import { DecisionCache } from "./cache.js";
import { prepareFileAnalysis } from "./files.js";
import { decideLocally } from "./pipeline.js";
import { SEED_EQUIVALENT_POLICIES } from "./e2e-texte.scenarios.js";

/**
 * Chaque fixture de data/fixtures-fichiers annonce son action dans son nom
 * (`<format>-<ACTION>-<sujet>`). Ce test garantit que le contenu tient la promesse,
 * dans la direction la plus stricte (Cotisations, risque élevé).
 */
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../data/fixtures-fichiers");
const NAME = /^(txt|md|csv|sql|json|env|xlsx|docx|pptx|pdf|zip)-(ALLOW|MASK|BLOCK)-/;

/** Une archive n'est pas réécrite (v1) : un MASK dans un ZIP peut finir en BLOCK — voir docs/tests-fichiers-par-format/10-zip.md. */
const ACCEPTED: Record<string, PolicyAction[]> = { "zip-MASK-export-assures.zip": ["MASK", "BLOCK"] };

function cache(): DecisionCache {
  const c = new DecisionCache();
  c.hydrate({
    policyVersion: "fixtures",
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
    user: { userId: "00000000-0000-4000-8000-00000000f002", department: "Cotisations", departmentRiskLevel: "high", jurisdiction: "BJ", role: "USER" },
    heartbeatIntervalSeconds: 60,
    syncIntervalSeconds: 300,
    expectedModelHashes: {},
  });
  return c;
}

const fixtures = fs.readdirSync(DIR).filter((f) => NAME.test(f)).sort();
const engine = new DetectionEngine();

describe("fixtures fichiers — action annoncée par le nom", () => {
  beforeAll(async () => {
    await engine.initialize();
  });

  it("le jeu couvre tous les formats (txt et md comptés à part)", () => {
    expect(new Set(fixtures.map((f) => f.split("-")[0])).size).toBe(11);
  });

  it.each(fixtures)("%s", async (fileName) => {
    const expected = NAME.exec(fileName)![2] as PolicyAction;
    const prepared = await prepareFileAnalysis("Analyse ce fichier", [
      { fileName, data: new Uint8Array(fs.readFileSync(path.join(DIR, fileName))) },
    ]);
    const decision = await decideLocally({
      promptText: "Analyse ce fichier",
      analysisText: prepared.analysisText,
      extractedFiles: prepared.extracted,
      channel: "browser",
      hostnameOrCommand: "chatgpt.com",
      engine,
      cache: cache(),
    });
    expect(ACCEPTED[fileName] ?? [expected]).toContain(decision.action);

    if (decision.action === "MASK") {
      expect(decision.sanitizedFiles).toHaveLength(1);
      const sanitized = decision.sanitizedFiles[0]!.text;
      for (const e of decision.entities) expect(sanitized).not.toContain(e.value);
    }
    if (expected === "ALLOW") expect(decision.entities).toEqual([]);
  });
});

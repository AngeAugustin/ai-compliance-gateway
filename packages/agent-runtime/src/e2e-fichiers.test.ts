import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DetectionEngine } from "@acg/detection-engine";
import { extractOne } from "@acg/file-extract";
import { DEFAULT_AI_SERVICES, DEFAULT_RISK_BAND_THRESHOLDS, DEFAULT_RISK_WEIGHTS } from "@acg/shared";
import { DecisionCache } from "./cache.js";
import { prepareFileAnalysis } from "./files.js";
import { decideLocally } from "./pipeline.js";
import { SEED_EQUIVALENT_POLICIES } from "./e2e-texte.scenarios.js";

const FIXTURES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../data/fixtures-fichiers");

function readFixture(name: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, name)));
}

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
    expect(decision.sanitizedFiles).toHaveLength(1);
    expect(decision.sanitizedFiles[0]!.text).not.toContain("A12345678");
    expect(decision.sanitizedFiles[0]!.text).toMatch(/NUM_ASSURE_\d{3}/);
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

  it("F-FILE-05 — DOCX avec CNSS → MASK (anonymisation binaire)", async () => {
    const data = readFixture("docx-MASK-rappel-assure.docx");
    const prepared = await prepareFileAnalysis("Résume ce rappel", [
      { fileName: "rappel-assure.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data },
    ]);
    const engine = new DetectionEngine();
    await engine.initialize();
    const decision = await decideLocally({
      promptText: "Résume ce rappel",
      analysisText: prepared.analysisText,
      extractedFiles: prepared.extracted,
      channel: "browser",
      hostnameOrCommand: "chatgpt.com",
      engine,
      cache: cacheCotisations(),
    });
    expect(decision.action).toBe("MASK");
    expect(decision.blockAttachments).toBe(false);
    expect(decision.sanitizedFiles).toHaveLength(1);
    expect(decision.sanitizedFiles[0]!.text).not.toContain("A12345678");
    expect(decision.sanitizedFiles[0]!.text).not.toContain("marie.agbodji@cnss.bj");
    expect(decision.sanitizedFiles[0]!.data.length).toBeGreaterThan(100);
  });

  it("F-FILE-06 — PDF avec CNSS → MASK (anonymisation binaire)", async () => {
    const data = readFixture("pdf-MASK-rappel.pdf");
    const prepared = await prepareFileAnalysis("Analyse ce PDF", [
      { fileName: "rappel.pdf", mimeType: "application/pdf", data },
    ]);
    const engine = new DetectionEngine();
    await engine.initialize();
    const decision = await decideLocally({
      promptText: "Analyse ce PDF",
      analysisText: prepared.analysisText,
      extractedFiles: prepared.extracted,
      channel: "browser",
      hostnameOrCommand: "chatgpt.com",
      engine,
      cache: cacheCotisations(),
    });
    expect(decision.action).toBe("MASK");
    expect(decision.blockAttachments).toBe(false);
    expect(decision.sanitizedFiles).toHaveLength(1);
    expect(decision.sanitizedFiles[0]!.text).not.toContain("A12345678");
    expect(decision.sanitizedFiles[0]!.data.length).toBeGreaterThan(50);
  });

  it("F-FILE-07 — XLSX avec données sensibles → MASK (anonymisation binaire)", async () => {
    const data = readFixture("09-MASK-cotisations.xlsx");
    const prepared = await prepareFileAnalysis("Analyse ce tableau", [
      {
        fileName: "cotisations.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        data,
      },
    ]);
    const engine = new DetectionEngine();
    await engine.initialize();
    const decision = await decideLocally({
      promptText: "Analyse ce tableau",
      analysisText: prepared.analysisText,
      extractedFiles: prepared.extracted,
      channel: "browser",
      hostnameOrCommand: "chatgpt.com",
      engine,
      cache: cacheCotisations(),
    });
    expect(decision.action).toBe("MASK");
    expect(decision.blockAttachments).toBe(false);
    expect(decision.sanitizedFiles).toHaveLength(1);
    expect(decision.sanitizedFiles[0]!.data.length).toBeGreaterThan(100);
  });

  it("F-FILE-08 — PPTX avec données sensibles → MASK (anonymisation binaire)", async () => {
    const data = readFixture("pptx-MASK-brief-cnss.pptx");
    const prepared = await prepareFileAnalysis("Résume ce brief", [
      {
        fileName: "brief-cnss.pptx",
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        data,
      },
    ]);
    const engine = new DetectionEngine();
    await engine.initialize();
    const decision = await decideLocally({
      promptText: "Résume ce brief",
      analysisText: prepared.analysisText,
      extractedFiles: prepared.extracted,
      channel: "browser",
      hostnameOrCommand: "chatgpt.com",
      engine,
      cache: cacheCotisations(),
    });
    expect(decision.action).toBe("MASK");
    expect(decision.blockAttachments).toBe(false);
    expect(decision.sanitizedFiles).toHaveLength(1);
    expect(decision.sanitizedFiles[0]!.data.length).toBeGreaterThan(100);
  });

  it("F-FILE-09 — PPTX avec clé API → BLOCK (prioritaire sur MASK)", async () => {
    const data = readFixture("11-BLOCK-brief-finance.pptx");
    const prepared = await prepareFileAnalysis("Transforme ces slides en notes", [
      {
        fileName: "brief-finance.pptx",
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        data,
      },
    ]);
    const engine = new DetectionEngine();
    await engine.initialize();
    const decision = await decideLocally({
      promptText: "Transforme ces slides en notes",
      analysisText: prepared.analysisText,
      extractedFiles: prepared.extracted,
      channel: "browser",
      hostnameOrCommand: "chatgpt.com",
      engine,
      cache: cacheCotisations(),
    });
    expect(decision.action).toBe("BLOCK");
    expect(decision.blockAttachments).toBe(true);
    expect(decision.entities.some((e) => (e.type ?? "") === "API_KEY" || (e.value ?? "").startsWith("sk-"))).toBe(true);
  });

  it("F-FILE-04 — image sans OCR → BLOCK fail-closed", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const prepared = await prepareFileAnalysis("Lis cette capture", [
      { fileName: "idents.png", mimeType: "image/png", data: png },
    ], { enableOcr: false });
    expect(prepared.extracted[0]?.extractionDegraded).toBe(true);
    const engine = new DetectionEngine();
    await engine.initialize();
    const decision = await decideLocally({
      promptText: "Lis cette capture",
      analysisText: prepared.analysisText,
      extractedFiles: prepared.extracted,
      channel: "browser",
      hostnameOrCommand: "chatgpt.com",
      engine,
      cache: cacheCotisations(),
    });
    expect(decision.action).toBe("BLOCK");
    expect(decision.blockAttachments).toBe(true);
    expect(decision.decision.userMessage ?? "").toMatch(/analyser|OCR|fiable/i);
  });
});

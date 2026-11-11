/**
 * Agent CLI (A2) testé comme un utilisateur le lance : un vrai processus Node, un répertoire
 * personnel jetable (~/.acg), et une commande cible inoffensive (`echo`) à la place d'un CLI d'IA.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_AI_SERVICES, DEFAULT_RISK_BAND_THRESHOLDS, DEFAULT_RISK_WEIGHTS } from "@acg/shared";

const ROOT = resolve(__dirname, "../../..");
const TSX = join(ROOT, "node_modules/tsx/dist/cli.mjs");
const CLI = join(ROOT, "apps/agent-cli/src/cli.ts");
const SECRET = "sk-abcdefghijklmnopqrstuvwxyz012345";

let home: string;

function run(...args: string[]) {
  const r = spawnSync(process.execPath, [TSX, CLI, ...args], {
    cwd: home,
    env: { ...process.env, HOME: home, USERPROFILE: home, ACG_ENABLE_NER: "0", NER_MODEL_PATH: "", LLM_MODEL_PATH: "", NER_DISABLE_HUB: "1" },
    encoding: "utf8",
    timeout: 60_000,
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

/** Configuration non enrôlée avec une dernière synchro : décisions locales, sans réseau. */
function writeConfig(policies: unknown[]) {
  mkdirSync(join(home, ".acg"), { recursive: true });
  writeFileSync(
    join(home, ".acg", "agent-a2.json"),
    JSON.stringify({
      apiUrl: "http://127.0.0.1:9",
      module: "A2",
      lastPolicyVersion: "test",
      lastSnapshot: {
        policyVersion: "test",
        generatedAt: new Date().toISOString(),
        policies,
        aiServices: DEFAULT_AI_SERVICES.map((s) => ({
          id: s.id,
          name: s.name,
          hostingRegion: s.hostingRegion,
          riskBaseline: s.riskBaseline,
          freeAccess: s.freeAccess,
          domains: s.domains,
          cliCommands: s.cliCommands,
        })),
        riskWeights: DEFAULT_RISK_WEIGHTS,
        riskBandThresholds: DEFAULT_RISK_BAND_THRESHOLDS,
        organization: { jurisdiction: "BJ", regulatoryFrameworkId: "BJ_MALABO" },
        user: { userId: "00000000-0000-4000-8000-0000000000a2", department: "Prestations", departmentRiskLevel: "moderate", jurisdiction: "BJ", role: "USER" },
        heartbeatIntervalSeconds: 60,
        syncIntervalSeconds: 300,
        expectedModelHashes: {},
      },
    }),
  );
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "acg-cli-test-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("agent CLI A2", () => {
  it("affiche l'aide et refuse une commande inconnue", () => {
    const help = run("help");
    expect(help.code).toBe(0);
    expect(help.out).toContain("intercept <commande>");
    const unknown = run("nimporte");
    expect(unknown.code).toBe(1);
    expect(unknown.err).toContain("Commande inconnue");
  });

  it("refuse l'enrôlement sans jeton", () => {
    const r = run("enroll", "--api", "http://127.0.0.1:9");
    expect(r.code).toBe(1);
    expect(r.err).toContain("Jeton manquant");
  });

  it("indique qu'un poste neuf n'est pas enrôlé et qu'aucun démon ne tourne", () => {
    const r = run("status");
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toMatchObject({ enrolled: false, agentId: null, daemon: false });
  });

  it("refuse de lancer le démon sur un poste non enrôlé", () => {
    const r = run("daemon");
    expect(r.code).toBe(1);
    expect(r.err).toContain("non enrôlé");
  });

  it("écrit un wrapper par CLI d'IA connu", () => {
    const r = run("install");
    expect(r.code).toBe(0);
    const bin = join(home, ".acg", "bin");
    for (const name of DEFAULT_AI_SERVICES.flatMap((s) => s.cliCommands)) {
      expect(existsSync(join(bin, `${name}.cmd`))).toBe(true);
      expect(readFileSync(join(bin, name), "utf8")).toContain(`intercept ${name} --`);
    }
  });

  it("bloque un prompt contenant un secret : code 2 et la commande n'est pas lancée", () => {
    const r = run("intercept", "echo", "--", `MARQUEUR-ENVOYE ma cle ${SECRET}`);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/bloqu/i);
    expect(r.out).not.toContain("MARQUEUR-ENVOYE");
  });

  it("laisse passer un prompt anodin vers la commande d'origine", () => {
    const r = run("intercept", "echo", "--", "Resume ce paragraphe sur la photosynthese");
    expect(r.code).toBe(0);
    expect(r.out).toContain("Resume ce paragraphe sur la photosynthese");
  });

  it("masque le prompt avant de le transmettre quand la politique le demande", () => {
    writeConfig([
      {
        id: "00000000-0000-4000-8000-0000000000b2",
        name: "Masquer les courriels",
        conditionExpr: `contains(entity_type, "EMAIL")`,
        action: "MASK",
        priority: 5,
        version: 1,
        enabled: true,
        referenceFrameworks: [],
      },
    ]);
    const r = run("intercept", "echo", "--", "Ecris a koffi.adjovi@exemple.bj demain");
    expect(r.code).toBe(0);
    expect(r.err).toContain("[ACG MASK]");
    expect(r.out).not.toContain("koffi.adjovi@exemple.bj");
    expect(r.out).toContain("Ecris a");
  });

  it("anonymise un fichier joint et transmet la copie au lieu de l'original", () => {
    writeConfig([
      {
        id: "00000000-0000-4000-8000-0000000000b2",
        name: "Masquer les courriels",
        conditionExpr: `contains(entity_type, "EMAIL")`,
        action: "MASK",
        priority: 5,
        version: 1,
        enabled: true,
        referenceFrameworks: [],
      },
    ]);
    const file = join(home, "contacts.txt");
    writeFileSync(file, "Contact : koffi.adjovi@exemple.bj\n");
    // `type` / `cat` affiche le fichier reçu en argument : on voit ce que le CLI d'IA aurait reçu.
    const r = run("intercept", process.platform === "win32" ? "type" : "cat", "--", file);
    expect(r.code).toBe(0);
    expect(r.err).toContain("Fichiers anonymisés");
    expect(r.out).not.toContain("koffi.adjovi@exemple.bj");
    expect(readFileSync(file, "utf8")).toContain("koffi.adjovi@exemple.bj"); // l'original n'est pas modifié
  });
});

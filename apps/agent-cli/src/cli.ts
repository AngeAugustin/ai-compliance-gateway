#!/usr/bin/env node
/**
 * Shim terminal A2 — TypeScript / Node (ADR-005 : alternative 100 % TS à Rust).
 *
 * Installation : `pnpm agents:build`
 * Enrôlement   : `node apps/agent-cli/dist/cli.js enroll --api http://localhost:4000 --token <jeton>`
 * (l'enrôlement installe aussi les wrappers dans ~/.acg/bin et lance le démon heartbeat)
 */
import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync, unlinkSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentRuntime, type LocalDecision } from "@acg/agent-runtime";
import { DetectionEngine } from "@acg/detection-engine";
import { DEFAULT_AI_SERVICES } from "@acg/shared";
import {
  daemonLogPath,
  daemonPidPath,
  fileConfigStore,
  fileQueuePersist,
  isDaemonAlive,
  readDaemonPid,
  shimBinDir,
} from "./store.js";

const args = process.argv.slice(2);
const cmd = args[0] ?? "help";

if (cmd === "help" || cmd === "--help") {
  console.log(`ACG shim A2
  enroll --api <url> --token <jeton>   Enrôler cet hôte auprès de l'API
  status                               État de l'agent (dont démon heartbeat)
  daemon                               Heartbeat + sync en arrière-plan
  stop                                 Arrêter le démon
  intercept <commande> [--] [args...]  Intercepter une invocation CLI
  install                              Écrire les wrappers dans ~/.acg/bin
  uninstall                            Message de retrait du PATH
`);
  process.exit(0);
}

async function createEngine(kind: "fast" | "full"): Promise<DetectionEngine> {
  const wantNer = kind === "full" || Boolean(process.env.NER_MODEL_PATH) || process.env.ACG_ENABLE_NER === "1";
  if (wantNer) {
    const { createNodeDetectionEngine } = await import("@acg/detection-engine/node");
    return createNodeDetectionEngine({
      nerModelPath: process.env.NER_MODEL_PATH,
      nerModelSha256: process.env.NER_MODEL_SHA256,
      llmModelPath: process.env.LLM_MODEL_PATH,
      llmModelSha256: process.env.LLM_MODEL_SHA256,
      allowHub: process.env.NER_DISABLE_HUB !== "1",
      nerHubModel: process.env.NER_HUB_MODEL,
    });
  }
  const engine = new DetectionEngine();
  await engine.initialize();
  return engine;
}

async function createRuntime(kind: "fast" | "full"): Promise<AgentRuntime> {
  return new AgentRuntime({
    module: "A2",
    store: fileConfigStore(),
    engine: await createEngine(kind),
    queuePersist: fileQueuePersist(),
  });
}

function selfPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "cli.js");
}

async function spawnDaemon(): Promise<void> {
  if (await isDaemonAlive()) return;
  await mkdir(dirname(daemonLogPath()), { recursive: true });
  const logFd = openSync(daemonLogPath(), "a");
  const child = spawn(process.execPath, [selfPath(), "daemon"], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    windowsHide: true,
  });
  child.unref();
  closeSync(logFd);
  for (let i = 0; i < 25; i++) {
    if (await isDaemonAlive()) return;
    await new Promise((r) => setTimeout(r, 80));
  }
}

async function stopDaemon(): Promise<boolean> {
  const pid = await readDaemonPid();
  if (!pid) return false;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    /* déjà mort */
  }
  try {
    await unlink(daemonPidPath());
  } catch {
    /* ignore */
  }
  return true;
}

if (cmd === "enroll") {
  const api = flag("--api") ?? "http://localhost:4000";
  const token = flag("--token");
  if (!token) {
    console.error("Jeton manquant. Générez un jeton A2 depuis le Dashboard (RSSI).");
    process.exit(1);
  }
  const runtime = await createRuntime("fast");
  await runtime.configure(api, token);
  await runtime.start({ heartbeat: false });
  await runtime.enroll(homedir(), "0.1.0-A2", { heartbeat: false });
  runtime.stop();
  await writeWrappers(runtime);
  await spawnDaemon();
  console.log(`Enrôlé agentId=${runtime.getConfig().agentId}`);
  console.log(`Wrappers écrits dans ${shimBinDir()}`);
  console.log(`Démon heartbeat lancé (journal : ${daemonLogPath()})`);
  console.log("Windows (PowerShell) : $env:Path = \"$env:USERPROFILE\\.acg\\bin;\" + $env:Path");
  console.log("L'agent synchronise les politiques, émet un heartbeat et intercepte les CLI d'IA.");
  process.exit(0);
}

if (cmd === "status") {
  const runtime = await createRuntime("fast");
  await runtime.start({ heartbeat: false });
  const c = runtime.getConfig();
  const daemon = await isDaemonAlive();
  console.log(JSON.stringify({ enrolled: runtime.isEnrolled(), agentId: c.agentId, apiUrl: c.apiUrl, daemon }, null, 2));
  runtime.stop();
  process.exit(0);
}

if (cmd === "install") {
  const runtime = await createRuntime("fast");
  await writeWrappers(runtime);
  console.log(`Wrappers écrits dans ${shimBinDir()}`);
  console.log("Windows (PowerShell) : $env:Path = \"$env:USERPROFILE\\.acg\\bin;\" + $env:Path");
  process.exit(0);
}

if (cmd === "uninstall") {
  await stopDaemon();
  console.log("Retirez ~/.acg/bin du PATH. Les wrappers peuvent rester en place.");
  process.exit(0);
}

if (cmd === "stop") {
  const stopped = await stopDaemon();
  console.log(stopped ? "Démon A2 arrêté." : "Aucun démon A2 n'était actif.");
  process.exit(0);
}

if (cmd === "daemon") {
  if (await isDaemonAlive()) {
    const existing = await readDaemonPid();
    if (existing && existing !== process.pid) {
      console.error(`Un démon A2 tourne déjà (pid ${existing}).`);
      process.exit(1);
    }
  }
  await mkdir(dirname(daemonPidPath()), { recursive: true });
  await writeFile(daemonPidPath(), String(process.pid), "utf8");
  const runtime = await createRuntime("full");
  const cleanup = () => {
    runtime.stop();
    try {
      unlinkSync(daemonPidPath());
    } catch {
      /* ignore */
    }
  };
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
  process.on("exit", cleanup);
  await runtime.start({ heartbeat: true, heartbeatRef: true });
  if (!runtime.isEnrolled()) {
    console.error("Agent A2 non enrôlé — impossible de démarrer le démon.");
    cleanup();
    process.exit(1);
  }
  console.log(`Démon A2 actif agentId=${runtime.getConfig().agentId} pid=${process.pid}`);
  // Le timer heartbeat est ref'd (heartbeatRef) : il retient le process Node.
} else if (cmd === "intercept") {
  const rest = args.slice(1);
  const sep = rest.indexOf("--");
  const command = sep >= 0 ? rest[0]! : rest[0]!;
  const commandArgs = sep >= 0 ? rest.slice(sep + 1) : rest.slice(1);
  const daemon = await isDaemonAlive();
  const runtime = await createRuntime("fast");
  await runtime.start({ heartbeat: !daemon });
  const prompt = extractPrompt(commandArgs);
  const filePaths = findFilePaths(commandArgs);
  const files = await loadFiles(filePaths);
  if (prompt || files.length > 0) {
    const decision = await runtime.intercept(prompt || "(fichier joint)", "cli", command, files, {
      enableOcr: process.env.ACG_ENABLE_OCR !== "0",
    });
    if (decision.action === "BLOCK") {
      console.error(decision.decision.userMessage ?? "ACG : interaction bloquée.");
      runtime.stop();
      process.exit(2);
    }
    if (decision.action === "MASK") {
      if (prompt) rewritePrompt(commandArgs, decision.maskedText);
      if (decision.sanitizedFiles.length) {
        await materializeSanitizedFiles(decision, filePaths, commandArgs);
        console.error(`[ACG MASK] Fichiers anonymisés : ${decision.sanitizedFileNames.join(", ")}`);
      }
      console.error(`[ACG MASK] ${decision.decision.userMessage ?? "texte anonymisé"}`);
    } else if (decision.action === "WARN") {
      console.error(`[ACG WARN] ${decision.decision.userMessage ?? "journalisé"}`);
    }
  }
  runtime.stop();
  const child = spawn(command, commandArgs, { stdio: "inherit", shell: true });
  child.on("exit", (code) => {
    process.exitCode = code ?? 0;
  });
} else {
  console.error(`Commande inconnue : ${cmd}`);
  process.exit(1);
}

function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function extractPrompt(argv: string[]): string {
  const joined = argv.join(" ");
  const quoted = joined.match(/"([^"]+)"|'([^']+)'/);
  if (quoted) return quoted[1] ?? quoted[2] ?? "";
  return argv.filter((a) => !a.startsWith("-")).join(" ");
}

function findFilePaths(argv: string[]): string[] {
  const paths: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if ((a === "--file" || a === "-f") && argv[i + 1]) {
      paths.push(argv[++i]!);
      continue;
    }
    if (a.startsWith("@") && a.length > 1) paths.push(a.slice(1));
    else if (/\.(csv|tsv|txt|md|json|jsonl|xml|html?|sql|ya?ml|toml|ini|cfg|conf|env|log|rtf|properties|sh|ps1|bat|js|ts|jsx|tsx|py|java|cs|go|rb|php|pdf|docx?|xlsx?|pptx?|od[tsp]|zip|jar|png|jpe?g|webp|gif|bmp|tiff?)$/i.test(a) && existsSync(a)) {
      paths.push(a);
    }
  }
  return [...new Set(paths)];
}

async function loadFiles(paths: string[]) {
  const out: { fileName: string; mimeType?: string; data: Uint8Array }[] = [];
  for (const p of paths) {
    const data = await readFile(p);
    out.push({ fileName: p.split(/[/\\]/).pop() ?? p, data: new Uint8Array(data) });
  }
  return out;
}

function rewritePrompt(argv: string[], masked: string): void {
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i]!.startsWith("-")) {
      argv[i] = masked;
      return;
    }
  }
  argv.push(masked);
}

/** Écrit les fichiers jetonés dans un répertoire temporaire et réécrit les chemins dans argv. */
async function materializeSanitizedFiles(
  decision: LocalDecision,
  originalPaths: string[],
  argv: string[],
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "acg-mask-"));
  const byName = new Map(decision.sanitizedFiles.map((f) => [f.fileName, f]));
  for (const orig of originalPaths) {
    const name = basename(orig);
    const sanitized = byName.get(name);
    if (!sanitized) continue;
    const outPath = join(dir, name);
    await writeFile(outPath, sanitized.data);
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i]!;
      if (a === orig || a.endsWith(orig) || basename(a) === name) {
        argv[i] = outPath;
      } else if (a.startsWith("@") && (a.slice(1) === orig || basename(a.slice(1)) === name)) {
        argv[i] = `@${outPath}`;
      }
    }
  }
}

async function writeWrappers(runtime: AgentRuntime): Promise<void> {
  await runtime.start({ heartbeat: false });
  const fromSync = runtime.getConfig().lastSnapshot?.aiServices ?? DEFAULT_AI_SERVICES;
  const dir = shimBinDir();
  await mkdir(dir, { recursive: true });
  const self = selfPath();
  const commands = [...new Set(fromSync.flatMap((s) => s.cliCommands))];
  for (const name of commands) {
    const ps1 = join(dir, `${name}.cmd`);
    await writeFile(ps1, `@echo off\r\nnode "${self}" intercept ${name} -- %*\r\n`, "utf8");
    const sh = join(dir, name);
    await writeFile(sh, `#!/usr/bin/env bash\nexec node "${self}" intercept ${name} -- "$@"\n`, "utf8");
    try {
      await chmod(sh, 0o755);
    } catch {
      /* Windows */
    }
  }
  await writeFile(join(dir, "acg-shim.cmd"), `@echo off\r\nnode "${self}" %*\r\n`, "utf8");
  await writeFile(join(dir, "acg-daemon.cmd"), `@echo off\r\nnode "${self}" daemon\r\n`, "utf8");
}

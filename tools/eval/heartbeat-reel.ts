/**
 * Heartbeat des vrais agents — `pnpm eval:heartbeat:reel`.
 *
 * Les mesures précédentes (heartbeat-latency.ts, heartbeat-fausses-alertes.ts) simulent les agents.
 * Ici, on fait tourner les agents tels qu'ils sont livrés :
 * - A1 : l'extension compilée (apps/agent-browser/dist) dans Chromium, enrôlée par sa fenêtre ;
 *   le signal part d'une alarme chrome.alarms (période 1 min) qui réveille le service worker ;
 * - A2 : le CLI compilé (apps/agent-cli/dist), enrôlé par `acg enroll`, qui lance son démon détaché.
 * On relève en base, chaque seconde, l'heure de réception de chaque signal (last_heartbeat_at,
 * horloge de la base), on en déduit les écarts, et on compte les alertes « agent manquant ».
 *
 * Non couvert : mise en veille du poste, navigateur fermé, Chrome en arrière-plan prolongé
 * (le navigateur reste ouvert et le poste éveillé pendant la mesure).
 *
 * Prérequis : `pnpm agents:build`, API sur une base …_charge.
 * Options : --api <url> (défaut http://localhost:4100) · --duree <min> (défaut 15)
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Client } from "pg";
import { chromium } from "playwright";
import { DATABASE_URL, databaseNameFromUrl } from "../../db/scripts/env.js";

const { values: args } = parseArgs({
  options: {
    api: { type: "string", default: "http://localhost:4100" },
    duree: { type: "string", default: "15" },
    sortie: { type: "string", default: "docs/evaluation/resultats" },
  },
});
const log = (m: string) => console.log(`[heartbeat-reel] ${m}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const EXT = resolve("apps/agent-browser/dist");
const CLI = resolve("apps/agent-cli/dist/cli.js");

async function token(db: Client, module: "A1" | "A2"): Promise<string> {
  const user = (await db.query<{ id: string }>(`SELECT id FROM app_user WHERE role = 'USER' ORDER BY email LIMIT 1`)).rows[0]!;
  const t = `mesure-hb-${module}-${Date.now()}`;
  await db.query(
    `INSERT INTO enrollment_token(token_hash, modules, user_id, expires_at) VALUES ($1, ARRAY[$3], $2, now() + interval '1 hour')`,
    [createHash("sha256").update(t).digest("hex"), user.id, module],
  );
  return t;
}

function gapStats(times: number[]) {
  const gaps = times.slice(1).map((t, i) => (t - times[i]!) / 1000);
  const s = [...gaps].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))] ?? NaN;
  return { signals: times.length, gaps: gaps.length, min: s[0] ?? NaN, p50: q(0.5), p95: q(0.95), max: s[s.length - 1] ?? NaN, over300: gaps.filter((g) => g > 300).length };
}

async function main() {
  const dbName = databaseNameFromUrl(DATABASE_URL);
  if (!dbName.endsWith("_charge")) throw new Error(`Base « ${dbName} » refusée : utilisez une base jetable …_charge.`);
  for (const p of [EXT, CLI]) if (!existsSync(p)) throw new Error(`${p} absent : lancez pnpm agents:build`);
  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  const startedAt = new Date();

  // —— A1 : extension dans Chromium ——
  const userDir = mkdtempSync(join(tmpdir(), "acg-hb-ext-"));
  const context = await chromium.launchPersistentContext(userDir, {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  const t1 = await token(db, "A1");
  const enrolled = await popup.evaluate(
    async ([api, tok]) => {
      const chrome = (globalThis as unknown as { chrome: { runtime: { sendMessage(m: unknown): Promise<{ ok: boolean; agentId?: string }> } } }).chrome;
      await chrome.runtime.sendMessage({ type: "CONFIGURE", apiUrl: api, token: tok });
      return chrome.runtime.sendMessage({ type: "ENROLL", hostname: "mesure-heartbeat-extension" });
    },
    [args.api!, t1],
  );
  if (!enrolled?.ok) throw new Error(`enrôlement de l'extension refusé : ${JSON.stringify(enrolled)}`);
  await popup.close(); // plus aucune page de l'extension ouverte : seule l'alarme réveille le service worker
  const a1 = enrolled.agentId as string;
  log(`A1 enrôlé ${a1.slice(0, 8)}`);

  // —— A2 : CLI et son démon ——
  const home = mkdtempSync(join(tmpdir(), "acg-hb-cli-"));
  const env = { ...process.env, HOME: home, USERPROFILE: home, ACG_ENABLE_NER: "0", NER_MODEL_PATH: "", LLM_MODEL_PATH: "", NER_DISABLE_HUB: "1" };
  const r = spawnSync(process.execPath, [CLI, "enroll", "--api", args.api!, "--token", await token(db, "A2")], { env, encoding: "utf8", timeout: 120_000 });
  const a2 = r.stdout.match(/agentId=([0-9a-f-]{36})/)?.[1];
  if (!a2) throw new Error(`enrôlement du CLI refusé : ${r.stdout}\n${r.stderr}`);
  log(`A2 enrôlé ${a2.slice(0, 8)}, démon lancé`);

  // —— Relevé ——
  const seen: Record<string, number[]> = { [a1]: [], [a2]: [] };
  const end = Date.now() + Number(args.duree) * 60_000;
  let lastLog = 0;
  while (Date.now() < end) {
    const rows = await db.query<{ agent_id: string; t: Date | null }>(`SELECT agent_id, last_heartbeat_at AS t FROM agent WHERE agent_id = ANY($1::uuid[])`, [[a1, a2]]);
    for (const row of rows.rows) {
      const t = row.t?.getTime();
      const list = seen[row.agent_id]!;
      if (t && t !== list[list.length - 1]) list.push(t);
    }
    if (Date.now() - lastLog > 60_000) {
      log(`${Math.round((end - Date.now()) / 60_000)} min restantes · signaux A1 ${seen[a1]!.length}, A2 ${seen[a2]!.length}`);
      lastLog = Date.now();
    }
    await sleep(1000);
  }
  await sleep(35_000); // un dernier contrôle serveur
  const alerts = await db.query<{ agent_id: string; alert_type: string; n: string }>(
    `SELECT agent_id, alert_type, count(*)::text AS n FROM security_alert WHERE agent_id = ANY($1::uuid[]) AND created_at >= $2 AND alert_type IN ('AGENT_MISSING','AGENT_RECOVERED') GROUP BY agent_id, alert_type`,
    [[a1, a2], startedAt],
  );
  const count = (id: string, type: string) => Number(alerts.rows.find((a) => a.agent_id === id && a.alert_type === type)?.n ?? 0);

  // Arrêt propre : navigateur, démon (fichier daemon.pid), dossiers jetables.
  await context.close();
  const pidFile = join(home, ".acg", "daemon.pid");
  if (existsSync(pidFile)) {
    try {
      process.kill(Number(readFileSync(pidFile, "utf8").trim()));
    } catch {
      /* déjà arrêté */
    }
  }
  await db.end();
  await sleep(500);
  rmSync(userDir, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });

  const rows = [
    { label: "A1 — extension (Chromium, alarme chrome.alarms)", id: a1 },
    { label: "A2 — démon du CLI (processus Node détaché)", id: a2 },
  ].map((x) => ({ ...x, ...gapStats(seen[x.id]!), missing: count(x.id, "AGENT_MISSING") }));
  const f = (x: number) => (Number.isFinite(x) ? x.toFixed(1).replace(".", ",") : "—");
  const md = [
    `# Heartbeat des vrais agents`,
    `Date : ${new Date().toISOString().slice(0, 10)} · durée ${args.duree} min · signal attendu toutes les 60 s · seuil d'alerte 300 s · API et base sur la même machine. Script : [heartbeat-reel.ts](../../../tools/eval/heartbeat-reel.ts).`,
    `| Agent | Signaux reçus | Écart min | Écart médian | p95 | Écart max | Écarts > 300 s | Alertes « manquant » |`,
    `| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`,
    ...rows.map((r) => `| ${r.label} | ${r.signals} | ${f(r.min)} s | ${f(r.p50)} s | ${f(r.p95)} s | ${f(r.max)} s | ${r.over300} | ${r.missing} |`),
    `## Lecture`,
    `- Heure de réception prise en base (last_heartbeat_at), relevée chaque seconde : précision d'environ 1 s.`,
    `- Les écarts sont ceux que voit le serveur : retard de l'alarme ou du minuteur, plus le temps d'envoi.`,
    `- Non couvert : poste en veille, navigateur fermé, Chrome longtemps en arrière-plan. Dans ces cas l'alerte est attendue (l'agent ne protège plus), ce que vérifie le profil témoin de heartbeat-fausses-alertes.md.`,
  ].reduce((md, line, i, all) => md + (i === 0 ? "" : (line.startsWith("|") && all[i - 1]!.startsWith("|")) || (line.startsWith("- ") && all[i - 1]!.startsWith("- ")) ? "\n" : "\n\n") + line, "");
  const out = resolve(args.sortie!);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "heartbeat-reel.md"), md + "\n", "utf8");
  writeFileSync(join(out, "heartbeat-reel.json"), JSON.stringify({ rows, signals: seen }, null, 2), "utf8");
  for (const r of rows) log(`${r.label} : ${r.signals} signaux, écart médian ${f(r.p50)} s, max ${f(r.max)} s, alertes ${r.missing}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});

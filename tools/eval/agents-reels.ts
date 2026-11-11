/**
 * Plusieurs agents réels et réseau simulé — `pnpm eval:agents-reels`.
 *
 * Partie A — latence réseau. Un agent réel (AgentRuntime, enrôlé par le vrai parcours) passe par
 * un relais local qui retarde chaque échange avec l'API d'un aller-retour (RTT) donné. On mesure
 * le temps total d'intercept(), celui que l'utilisateur attend, pour chaque RTT.
 *
 * Partie B — agents réels simultanés. N processus distincts, comme N postes : chacun charge son
 * moteur de détection, s'enrôle avec son propre jeton, synchronise les politiques, puis intercepte
 * les scénarios texte en boucle pendant la durée du palier. On mesure le temps vu par chaque
 * utilisateur, les erreurs, puis on vérifie en base : un événement par interaction, même action,
 * pas de divergence agent/serveur, séquestre pour chaque MASK, chaîne d'audit intacte.
 *
 * Limite : les N agents partagent le processeur de la machine, avec l'API et la base. Sur des
 * postes séparés, la détection locale ne se ferait pas concurrence : la mesure est pessimiste.
 *
 * Base refusée si son nom ne finit pas par « _charge ».
 * Options : --api <url> (défaut http://localhost:4100) · --rtt 0,50,150,300 · --repetitions <n> (défaut 2)
 *           --agents 1,5,10,20 · --duree <s> (défaut 30) · --moteur regles|complet (défaut regles)
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer, request as httpRequest, type Server } from "node:http";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Client } from "pg";
import { DATABASE_URL, databaseNameFromUrl } from "../../db/scripts/env.js";
import { DetectionEngine } from "../../packages/detection-engine/src/index.js";
import { NerOnnxLayer } from "../../packages/detection-engine/src/node.js";
import { AgentRuntime, memoryConfigStore } from "../../packages/agent-runtime/src/index.js";
import { TEXT_E2E_SCENARIOS } from "../../packages/agent-runtime/src/e2e-texte.scenarios.js";
import { randomUuid } from "../../packages/shared/src/index.js";

const { values: args } = parseArgs({
  options: {
    api: { type: "string", default: "http://localhost:4100" },
    rtt: { type: "string", default: "0,50,150,300" },
    repetitions: { type: "string", default: "2" },
    agents: { type: "string", default: "1,5,10,20" },
    duree: { type: "string", default: "30" },
    moteur: { type: "string", default: "regles" },
    worker: { type: "boolean", default: false },
    token: { type: "string" },
    "debut-a": { type: "string" },
    "fin-a": { type: "string" },
    sortie: { type: "string", default: "docs/evaluation/resultats" },
  },
});

const log = (m: string) => console.log(`[agents-reels] ${m}`);
const r1 = (x: number) => Math.round(x * 10) / 10;
function stats(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))] ?? NaN;
  return { n: s.length, p50: r1(q(0.5)), p95: r1(q(0.95)), max: r1(s[s.length - 1] ?? NaN) };
}

async function buildEngine(kind: string): Promise<DetectionEngine> {
  const extra = [];
  if (kind === "complet") {
    const ner = new NerOnnxLayer({ modelPath: process.env.NER_MODEL_PATH || undefined });
    const st = await ner.initialize();
    if (!st.available) throw new Error(`NER indisponible : ${st.detail}`);
    extra.push(ner);
  }
  const engine = new DetectionEngine({ extraLayers: extra });
  await engine.initialize();
  return engine;
}

/** Agent réel : enrôlement par le vrai parcours. Le moteur vient des sources, AgentRuntime du paquet compilé. */
async function realAgent(api: string, token: string, engine: DetectionEngine, name: string): Promise<AgentRuntime> {
  const runtime = new AgentRuntime({
    module: "A1",
    store: memoryConfigStore({ apiUrl: api }),
    engine: engine as unknown as ConstructorParameters<typeof AgentRuntime>[0]["engine"],
  });
  await runtime.start({ heartbeat: false });
  await runtime.configure(api, token);
  await runtime.enroll(name, "0.1.0-mesure", { heartbeat: false });
  return runtime;
}

async function newToken(db: Client): Promise<string> {
  const user = (await db.query<{ id: string }>(`SELECT id FROM app_user WHERE role = 'USER' ORDER BY email LIMIT 1`)).rows[0]!;
  const token = `mesure-${randomUuid()}`;
  await db.query(
    `INSERT INTO enrollment_token(token_hash, modules, user_id, expires_at) VALUES ($1, ARRAY['A1'], $2, now() + interval '1 hour')`,
    [createHash("sha256").update(token).digest("hex"), user.id],
  );
  return token;
}

/** Relais HTTP qui retarde la requête de RTT/2 à l'aller et la réponse de RTT/2 au retour. */
function delayProxy(target: string, rttMs: number): Promise<{ url: string; server: Server }> {
  const t = new URL(target);
  const half = rttMs / 2;
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      setTimeout(() => {
        const up = httpRequest(
          { host: t.hostname, port: t.port, path: req.url, method: req.method, headers: { ...req.headers, host: t.host } },
          (r) => {
            const body: Buffer[] = [];
            r.on("data", (c: Buffer) => body.push(c));
            r.on("end", () => setTimeout(() => {
              res.writeHead(r.statusCode ?? 502, r.headers);
              res.end(Buffer.concat(body));
            }, half));
          },
        );
        up.on("error", () => {
          res.writeHead(502);
          res.end();
        });
        up.end(Buffer.concat(chunks));
      }, half);
    });
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, server })));
}

/** Processus fils : un poste. Écrit une ligne JSON de résultats sur la sortie standard. */
async function worker() {
  const engine = await buildEngine(args.moteur!);
  const runtime = await realAgent(args.api!, args.token!, engine, `poste-${process.pid}`);
  const agentId = runtime.getConfig().agentId!;
  process.stdout.write(`PRET ${agentId}\n`);
  const endAt = Number(args["fin-a"]);
  const startAt = Number(args["debut-a"]);
  while (Date.now() < startAt) await new Promise((r) => setTimeout(r, 20)); // départ synchronisé
  const totals: number[] = [];
  const interactions: { id: string; action: string }[] = [];
  let errors = 0;
  let i = 0;
  while (Date.now() < endAt) {
    const sc = TEXT_E2E_SCENARIOS[i++ % TEXT_E2E_SCENARIOS.length]!;
    const t = performance.now();
    try {
      const d = await runtime.intercept(sc.text, sc.channel as "browser" | "cli", sc.hostnameOrCommand);
      totals.push(performance.now() - t);
      interactions.push({ id: d.interactionId, action: d.action });
    } catch {
      errors++;
    }
  }
  process.stdout.write(`RESULTAT ${JSON.stringify({ agentId, totals, interactions, errors, queued: runtime.queue.size() })}\n`);
  process.exit(0);
}

async function chainBreaks(db: Client, fromSeq: string) {
  const r = await db.query<{ events: string; breaks: string }>(
    `SELECT count(*)::text AS events, count(*) FILTER (WHERE prev_event_hash IS DISTINCT FROM prev)::text AS breaks
       FROM (SELECT sequence, prev_event_hash, lag(event_hash) OVER (ORDER BY sequence) AS prev FROM analytics.security_event) t
      WHERE sequence > $1`,
    [fromSeq],
  );
  return { events: Number(r.rows[0]!.events), breaks: Number(r.rows[0]!.breaks) };
}

async function main() {
  const dbName = databaseNameFromUrl(DATABASE_URL);
  if (!dbName.endsWith("_charge")) throw new Error(`Base « ${dbName} » refusée : utilisez une base jetable …_charge.`);
  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  const api = args.api!;

  // —— Partie A : latence réseau ——
  const engine = await buildEngine(args.moteur!);
  const rttRows: { rtt: number; total: ReturnType<typeof stats>; actions: string }[] = [];
  for (const rtt of args.rtt!.split(",").map(Number)) {
    const proxy = rtt > 0 ? await delayProxy(api, rtt) : null;
    const url = proxy?.url ?? api;
    const runtime = await realAgent(url, await newToken(db), engine, `rtt-${rtt}`);
    await runtime.intercept("Échauffement.", "browser", "chatgpt.com");
    const totals: number[] = [];
    const actions: Record<string, number> = {};
    for (let rep = 0; rep < Number(args.repetitions); rep++) {
      for (const sc of TEXT_E2E_SCENARIOS) {
        const t = performance.now();
        const d = await runtime.intercept(sc.text, sc.channel as "browser" | "cli", sc.hostnameOrCommand);
        totals.push(performance.now() - t);
        actions[d.action] = (actions[d.action] ?? 0) + 1;
      }
    }
    proxy?.server.close();
    const row = { rtt, total: stats(totals), actions: Object.entries(actions).map(([a, n]) => `${a} ${n}`).join(", ") };
    rttRows.push(row);
    log(`RTT ${rtt} ms : total p50 ${row.total.p50} ms, p95 ${row.total.p95} ms (${row.total.n} interactions)`);
  }

  // —— Partie B : agents réels simultanés ——
  const levels: { agents: number; ready: number; interactions: number; errors: number; perSecond: number; total: ReturnType<typeof stats>; logged: number; sameActions: boolean; divergences: number; masks: number; escrows: number; queued: number; chain: { events: number; breaks: number } }[] = [];
  const duration = Number(args.duree) * 1000;
  for (const n of args.agents!.split(",").map(Number)) {
    const fromSeq = (await db.query<{ s: string }>(`SELECT coalesce(max(sequence), 0)::text AS s FROM analytics.security_event`)).rows[0]!.s;
    // Laisse 60 s aux processus pour démarrer et s'enrôler, puis tous commencent ensemble.
    const startAt = Date.now() + 60_000;
    const endAt = startAt + duration;
    const tokens = await Promise.all(Array.from({ length: n }, () => newToken(db)));
    const results = await Promise.all(
      tokens.map(
        (token) =>
          new Promise<{ agentId: string; totals: number[]; interactions: { id: string; action: string }[]; errors: number; queued: number } | null>((ok) => {
            const child = spawn(process.execPath, [...process.execArgv, process.argv[1]!, "--worker", "--api", api, "--token", token, "--moteur", args.moteur!, "--debut-a", String(startAt), "--fin-a", String(endAt)], {
              stdio: ["ignore", "pipe", "pipe"],
              env: process.env,
            });
            let out = "";
            child.stdout.on("data", (c: Buffer) => (out += c.toString()));
            child.on("exit", () => {
              const line = out.split("\n").find((l) => l.startsWith("RESULTAT "));
              ok(line ? JSON.parse(line.slice(9)) : null);
            });
          }),
      ),
    );
    const ok = results.filter((r): r is NonNullable<typeof r> => r !== null);
    const all = ok.flatMap((r) => r.interactions);
    const totals = ok.flatMap((r) => r.totals);
    // Vérification en base, agent par agent.
    let logged = 0;
    let sameActions = true;
    let divergences = 0;
    for (const r of ok) {
      const ev = await db.query<{ action: string; server_decision: { action: string } | null }>(
        `SELECT action, server_decision FROM analytics.security_event WHERE agent_id = $1 AND sequence > $2 ORDER BY sequence`,
        [r.agentId, fromSeq],
      );
      logged += ev.rows.length;
      if (ev.rows.length !== r.interactions.length || ev.rows.some((e, i) => e.action !== r.interactions[i]!.action)) sameActions = false;
      divergences += ev.rows.filter((e) => e.server_decision !== null && e.server_decision.action !== e.action).length;
    }
    const maskIds = all.filter((i) => i.action === "MASK").map((i) => i.id);
    const escrows = maskIds.length
      ? Number((await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM vault.escrow WHERE interaction_id = ANY($1::text[])`, [maskIds])).rows[0]!.n)
      : 0;
    const level = {
      agents: n,
      ready: ok.length,
      interactions: all.length,
      errors: ok.reduce((s, r) => s + r.errors, 0) + (n - ok.length),
      perSecond: r1(all.length / (duration / 1000)),
      total: stats(totals),
      logged,
      sameActions,
      divergences,
      masks: maskIds.length,
      escrows,
      queued: ok.reduce((s, r) => s + r.queued, 0),
      chain: await chainBreaks(db, fromSeq),
    };
    levels.push(level);
    log(`${n} agents (${ok.length} prêts) : ${all.length} interactions, ${level.perSecond}/s, total p50 ${level.total.p50} ms p95 ${level.total.p95} ms, erreurs ${level.errors}, journalisés ${logged}, ruptures ${level.chain.breaks}`);
  }
  await db.end();

  const md = [
    `# Agents réels et réseau simulé`,
    `Date : ${new Date().toISOString().slice(0, 10)} · moteur des agents : ${args.moteur === "complet" ? "règles + NER + mots-clés" : "règles + mots-clés"} · API et PostgreSQL sur la même machine · base jetable dédiée. Script : [agents-reels.ts](../../../tools/eval/agents-reels.ts).`,
    `## A. Effet de la latence réseau (un agent réel)`,
    `Un relais local retarde chaque échange agent ↔ API d'un aller-retour (RTT) donné. ${TEXT_E2E_SCENARIOS.length} scénarios texte × ${args.repetitions}.`,
    `| RTT simulé | Interactions | Total médian | p95 | max | Actions |`,
    `| ---: | ---: | ---: | ---: | ---: | :--- |`,
    ...rttRows.map((r) => `| ${r.rtt} ms | ${r.total.n} | ${r.total.p50} ms | ${r.total.p95} ms | ${r.total.max} ms | ${r.actions} |`),
    `## B. Agents réels simultanés`,
    `Chaque agent est un processus distinct (un poste) : son propre moteur, son propre enrôlement, sa propre synchronisation. Tous interceptent les scénarios en boucle pendant ${args.duree} s, départ synchronisé.`,
    `| Agents | Prêts | Interactions | Par seconde | Total médian | p95 | Erreurs | Journalisés | Actions identiques | Divergences | Séquestres | File restante | Ruptures de chaîne |`,
    `| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- | ---: | ---: | ---: | ---: |`,
    ...levels.map((l) => `| ${l.agents} | ${l.ready} | ${l.interactions} | ${l.perSecond} | ${l.total.p50} ms | ${l.total.p95} ms | ${l.errors} | ${l.logged} | ${l.sameActions ? "oui" : "**non**"} | ${l.divergences} | ${l.escrows}/${l.masks} | ${l.queued} | ${l.chain.breaks} |`),
    `## Lecture`,
    `- Le total est le temps d'intercept() : décision locale plus journalisation signée, que l'utilisateur attend avant l'envoi.`,
    `- Les agents partagent le processeur de la machine avec l'API et la base : sur des postes séparés, leur détection locale ne se ferait pas concurrence. Les temps en B sont donc pessimistes.`,
    `- Le relais simule un délai fixe, sans perte ni gigue.`,
  ].reduce((md, line, i, all) => md + (i === 0 ? "" : (line.startsWith("|") && all[i - 1]!.startsWith("|")) || (line.startsWith("- ") && all[i - 1]!.startsWith("- ")) ? "\n" : "\n\n") + line, "");
  const out = resolve(args.sortie!);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "agents-reels.md"), md + "\n", "utf8");
  writeFileSync(join(out, "agents-reels.json"), JSON.stringify({ rtt: rttRows, levels }, null, 2), "utf8");
  log(`rapport : ${join(out, "agents-reels.md")}`);
  process.exit(0);
}

(args.worker ? worker() : main()).catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});

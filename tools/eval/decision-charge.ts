/**
 * Décision de bout en bout et montée en charge — `pnpm eval:charge`.
 *
 * Partie 1 — bout en bout. Un vrai agent (AgentRuntime, celui de l'extension et du CLI) est
 * enrôlé par le vrai parcours (jeton → POST /v1/agents/enroll → synchro des politiques), puis
 * intercepte les scénarios texte E2E. On mesure, par interaction :
 *   - la décision locale (détection → score → politique → masquage) ;
 *   - l'aller-retour de journalisation (POST /v1/interactions/evaluate, signé) ;
 *   - le temps total d'intercept(), que l'utilisateur attend avant l'envoi.
 * On vérifie ensuite en base que chaque interaction a son événement, avec l'action appliquée,
 * sans divergence serveur inattendue, avec le séquestre pour chaque MASK, et une chaîne intacte.
 *
 * Partie 2 — charge. Des agents inscrits en base rejouent, en parallèle et en boucle fermée,
 * les requêtes signées capturées en partie 1 (nouvel identifiant à chaque envoi). Paliers de
 * concurrence croissants ; latence, débit et erreurs par palier ; puis contrôle de la chaîne
 * d'audit (un événement dont le prédécesseur n'est pas l'événement précédent = chaîne cassée).
 *
 * Le journal d'audit est en ajout seul : le script refuse de tourner sur une base dont le nom
 * ne finit pas par « _charge » (créez-la avec DATABASE_URL=…_charge pnpm db:reset).
 *
 * Options : --api <url> (défaut http://localhost:4001) · --moteur regles|complet (défaut complet)
 *           --repetitions <n> (défaut 5) · --paliers 1,5,10,25,50 · --duree-palier <s> (défaut 20)
 *           --sans-charge · --sortie <dossier>
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Client } from "pg";
import { DATABASE_URL, databaseNameFromUrl } from "../../db/scripts/env.js";
import { DetectionEngine } from "../../packages/detection-engine/src/index.js";
import { NerOnnxLayer } from "../../packages/detection-engine/src/node.js";
import { AgentRuntime, GatewayClient, memoryConfigStore } from "../../packages/agent-runtime/src/index.js";
import { TEXT_E2E_SCENARIOS } from "../../packages/agent-runtime/src/e2e-texte.scenarios.js";
import { generateAgentKeyPair, importPrivateKey, randomUuid, type EvaluateInteractionRequest } from "../../packages/shared/src/index.js";

const { values: args } = parseArgs({
  options: {
    api: { type: "string", default: "http://localhost:4001" },
    moteur: { type: "string", default: "complet" },
    repetitions: { type: "string", default: "5" },
    paliers: { type: "string", default: "1,5,10,25,50" },
    "duree-palier": { type: "string", default: "20" },
    "sans-charge": { type: "boolean", default: false },
    sortie: { type: "string", default: "docs/evaluation/resultats" },
  },
});

const log = (msg: string) => console.log(`[charge] ${msg}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const r1 = (x: number) => Math.round(x * 10) / 10;

function stats(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))] ?? NaN;
  return { n: s.length, p50: r1(q(0.5)), p95: r1(q(0.95)), p99: r1(q(0.99)), max: r1(s[s.length - 1] ?? NaN), mean: r1(s.reduce((a, b) => a + b, 0) / Math.max(1, s.length)) };
}
type Stats = ReturnType<typeof stats>;

/** Ruptures de chaîne : prédécesseur déclaré ≠ hachage de l'événement de séquence précédente. */
/** Seuls les événements de séquence > fromSeq (écrits par cette mesure) sont comptés. */
async function chainBreaks(db: Client, fromSeq: string): Promise<{ events: number; breaks: number; forks: number }> {
  const r = await db.query<{ events: string; breaks: string }>(
    `SELECT count(*)::text AS events,
            count(*) FILTER (WHERE prev_event_hash IS DISTINCT FROM prev)::text AS breaks
       FROM (SELECT sequence, prev_event_hash, lag(event_hash) OVER (ORDER BY sequence) AS prev FROM analytics.security_event) t
      WHERE sequence > $1`,
    [fromSeq],
  );
  const f = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM (SELECT prev_event_hash FROM analytics.security_event
       WHERE prev_event_hash IS NOT NULL AND sequence > $1 GROUP BY prev_event_hash HAVING count(*) > 1) t`,
    [fromSeq],
  );
  return { events: Number(r.rows[0]!.events), breaks: Number(r.rows[0]!.breaks), forks: Number(f.rows[0]!.n) };
}

async function buildEngine(kind: string): Promise<{ engine: DetectionEngine; label: string }> {
  if (kind === "regles") {
    const engine = new DetectionEngine();
    await engine.initialize();
    return { engine, label: "règles + mots-clés (sans NER)" };
  }
  const ner = new NerOnnxLayer({ modelPath: process.env.NER_MODEL_PATH || undefined });
  const status = await ner.initialize();
  if (!status.available) throw new Error(`NER indisponible : ${status.detail}`);
  const engine = new DetectionEngine({ extraLayers: [ner] });
  await engine.initialize();
  return { engine, label: "moteur complet (règles + NER + mots-clés)" };
}

interface E2ELine {
  id: string;
  action: string;
  localMs: number;
  evaluateMs: number;
  totalMs: number;
}

async function main() {
  const dbName = databaseNameFromUrl(DATABASE_URL);
  if (!dbName.endsWith("_charge")) {
    throw new Error(`Base « ${dbName} » refusée : le journal d'audit est en ajout seul. Utilisez une base jetable …_charge.`);
  }
  const health = await fetch(`${args.api}/v1/agents/heartbeat`, { method: "POST", body: "{}" }).catch(() => null);
  if (!health) throw new Error(`API injoignable sur ${args.api}`);
  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  // Chronométrage des appels de journalisation, et capture des requêtes pour la partie 2.
  const realFetch = globalThis.fetch;
  const evalTimes: number[] = [];
  const captured: EvaluateInteractionRequest[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const isEval = String(url).endsWith("/v1/interactions/evaluate");
    const t = performance.now();
    const res = await realFetch(url, init);
    if (isEval) {
      evalTimes.push(performance.now() - t);
      if (res.ok) captured.push(JSON.parse(String(init!.body)));
    }
    return res;
  }) as typeof fetch;

  // --- Partie 1 : bout en bout -------------------------------------------------------------
  const user = (await db.query<{ id: string; department: string }>(`SELECT id, department FROM app_user WHERE role = 'USER' ORDER BY email LIMIT 1`)).rows[0]!;
  const token = `mesure-${randomUuid()}`;
  await db.query(
    `INSERT INTO enrollment_token(token_hash, modules, user_id, expires_at) VALUES ($1, ARRAY['A1'], $2, now() + interval '1 hour')`,
    [createHash("sha256").update(token).digest("hex"), user.id],
  );
  const { engine, label: engineLabel } = await buildEngine(args.moteur!);
  // Moteur importé depuis les sources (src) ; AgentRuntime le type depuis le paquet compilé (dist) : même classe.
  const runtime = new AgentRuntime({
    module: "A1",
    store: memoryConfigStore({ apiUrl: args.api }),
    engine: engine as unknown as ConstructorParameters<typeof AgentRuntime>[0]["engine"],
  });
  await runtime.start({ heartbeat: false });
  await runtime.configure(args.api!, token);
  const enrollStart = performance.now();
  await runtime.enroll("mesure-bout-en-bout", "0.1.0-mesure", { heartbeat: false });
  const enrollMs = performance.now() - enrollStart;
  const agentId = runtime.getConfig().agentId!;
  log(`agent enrôlé ${agentId.slice(0, 8)} (${r1(enrollMs)} ms, politiques ${runtime.cache.get()?.policyVersion}) · ${engineLabel}`);

  await runtime.intercept("Échauffement du moteur.", "browser", "chatgpt.com");
  const firstSeq = await db.query<{ s: string }>(`SELECT coalesce(max(sequence), 0)::text AS s FROM analytics.security_event`);
  captured.length = 0;
  evalTimes.length = 0;

  const lines: E2ELine[] = [];
  const interactions: { interactionId: string; action: string }[] = [];
  const reps = Number(args.repetitions);
  for (let rep = 0; rep < reps; rep++) {
    for (const sc of TEXT_E2E_SCENARIOS) {
      const n = evalTimes.length;
      const t = performance.now();
      // Aucun scénario texte n'emprunte le canal "api" (réservé aux appels serveur).
      const d = await runtime.intercept(sc.text, sc.channel as "browser" | "cli", sc.hostnameOrCommand);
      const totalMs = performance.now() - t;
      lines.push({ id: sc.id, action: d.action, localMs: d.processingTimeMs, evaluateMs: evalTimes[n] ?? NaN, totalMs });
      interactions.push({ interactionId: d.interactionId, action: d.action });
    }
  }
  log(`${lines.length} interactions (${TEXT_E2E_SCENARIOS.length} scénarios × ${reps}) · file restante ${runtime.queue.size()}`);

  // Vérifications en base.
  const events = await db.query<{ action: string; server_decision: { action: string } | null; event_id: string }>(
    `SELECT action, server_decision, event_id FROM analytics.security_event WHERE agent_id = $1 AND sequence > $2 ORDER BY sequence`,
    [agentId, firstSeq.rows[0]!.s],
  );
  const logged = events.rows.map((e) => e.action);
  const sameOrder = logged.length === interactions.length && logged.every((a, i) => a === interactions[i]!.action);
  const divergences = events.rows.filter((e) => e.server_decision !== null && e.server_decision.action !== e.action).length;
  const maskIds = interactions.filter((i) => i.action === "MASK").map((i) => i.interactionId);
  const escrows = maskIds.length
    ? Number((await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM vault.escrow WHERE interaction_id = ANY($1::text[])`, [maskIds])).rows[0]!.n)
    : 0;
  const chainAfterE2E = await chainBreaks(db, firstSeq.rows[0]!.s);
  const actions = interactions.reduce<Record<string, number>>((m, i) => ((m[i.action] = (m[i.action] ?? 0) + 1), m), {});
  const e2e = {
    engine: engineLabel,
    enrollMs: r1(enrollMs),
    interactions: lines.length,
    actions,
    local: stats(lines.map((l) => l.localMs)),
    evaluate: stats(lines.map((l) => l.evaluateMs)),
    total: stats(lines.map((l) => l.totalMs)),
    queued: runtime.queue.size(),
    eventsLogged: logged.length,
    sameActionsInOrder: sameOrder,
    divergences,
    masks: maskIds.length,
    escrows,
    chain: chainAfterE2E,
  };
  log(`journalisés ${logged.length}/${interactions.length} · actions identiques et dans l'ordre : ${sameOrder} · divergences ${divergences} · séquestres ${escrows}/${maskIds.length} · ruptures de chaîne ${chainAfterE2E.breaks}`);
  log(`décision locale p50 ${e2e.local.p50} ms · journalisation p50 ${e2e.evaluate.p50} ms · total p50 ${e2e.total.p50} ms, p95 ${e2e.total.p95} ms`);
  globalThis.fetch = realFetch;

  // --- Partie 2 : charge -------------------------------------------------------------------
  const levels: { concurrency: number; requests: number; errors: number; errorKinds: Record<string, number>; throughput: number; latency: Stats }[] = [];
  let chainAfterLoad: Awaited<ReturnType<typeof chainBreaks>> | null = null;
  let loadEvents = { sent: 0, logged: 0 };
  if (!args["sans-charge"]) {
    const levelsWanted = args.paliers!.split(",").map(Number);
    const maxC = Math.max(...levelsWanted);
    const agents: { id: string; client: GatewayClient }[] = [];
    for (let i = 0; i < maxC; i++) {
      const pair = await generateAgentKeyPair();
      const id = randomUuid();
      await db.query(
        `INSERT INTO agent(agent_id, module, user_id, hostname, agent_version, public_key, last_heartbeat_at, integrity_status)
         VALUES ($1,'A1',$2,$3,'mesure-charge',$4, now(), 'ok')`,
        [id, user.id, `mesure-charge-${i + 1}`, JSON.stringify(pair.publicKey)],
      );
      const key = await importPrivateKey(pair.privateKey);
      agents.push({ id, client: new GatewayClient(args.api!, async () => key, () => id) });
    }
    const durationMs = Number(args["duree-palier"]) * 1000;
    let okTotal = 0;
    const loadSeq = (await db.query<{ s: string }>(`SELECT coalesce(max(sequence), 0)::text AS s FROM analytics.security_event`)).rows[0]!.s;
    for (const c of levelsWanted) {
      const latencies: number[] = [];
      const errorKinds: Record<string, number> = {};
      let next = 0;
      const end = Date.now() + durationMs;
      const started = Date.now();
      await Promise.all(
        agents.slice(0, c).map(async (agent) => {
          while (Date.now() < end) {
            const body = captured[next++ % captured.length]!;
            const t = performance.now();
            try {
              await agent.client.evaluate({ ...body, interactionId: randomUuid(), agentId: agent.id, occurredAt: new Date().toISOString() });
              latencies.push(performance.now() - t);
            } catch (e) {
              const kind = e instanceof Error ? (e.message.match(/→ (\d{3})/)?.[1] ?? e.message.slice(0, 40)) : "inconnue";
              errorKinds[kind] = (errorKinds[kind] ?? 0) + 1;
            }
          }
        }),
      );
      const elapsedS = (Date.now() - started) / 1000;
      const errors = Object.values(errorKinds).reduce((a, b) => a + b, 0);
      okTotal += latencies.length;
      const line = { concurrency: c, requests: latencies.length + errors, errors, errorKinds, throughput: r1(latencies.length / elapsedS), latency: stats(latencies) };
      levels.push(line);
      log(`palier ${c} : ${line.requests} requêtes · ${line.throughput} req/s · p50 ${line.latency.p50} ms · p95 ${line.latency.p95} ms · p99 ${line.latency.p99} ms · erreurs ${errors}`);
      await sleep(2000);
    }
    const logged = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM analytics.security_event WHERE agent_id = ANY($1::uuid[])`,
      [agents.map((a) => a.id)],
    );
    loadEvents = { sent: okTotal, logged: Number(logged.rows[0]!.n) };
    chainAfterLoad = await chainBreaks(db, loadSeq);
    log(`charge : ${loadEvents.logged} événements journalisés pour ${okTotal} réponses 200 · ruptures de chaîne ${chainAfterLoad.breaks} · bifurcations ${chainAfterLoad.forks}`);
  }
  await db.end();
  report({ e2e, levels, loadEvents, chainAfterLoad, durationS: Number(args["duree-palier"]) });
}

function report(r: {
  e2e: {
    engine: string;
    enrollMs: number;
    interactions: number;
    actions: Record<string, number>;
    local: Stats;
    evaluate: Stats;
    total: Stats;
    queued: number;
    eventsLogged: number;
    sameActionsInOrder: boolean;
    divergences: number;
    masks: number;
    escrows: number;
    chain: { events: number; breaks: number; forks: number };
  };
  levels: { concurrency: number; requests: number; errors: number; errorKinds: Record<string, number>; throughput: number; latency: Stats }[];
  loadEvents: { sent: number; logged: number };
  chainAfterLoad: { events: number; breaks: number; forks: number } | null;
  durationS: number;
}) {
  const f = (x: number) => (Number.isFinite(x) ? String(x).replace(".", ",") : "—");
  const e = r.e2e;
  const row = (label: string, s: Stats) => `| ${label} | ${s.n} | ${f(s.p50)} ms | ${f(s.p95)} ms | ${f(s.p99)} ms | ${f(s.max)} ms |`;
  const out = [
    `# Décision de bout en bout et charge — ${e.engine}`,
    `Date : ${new Date().toISOString().slice(0, 10)} · API et PostgreSQL sur la même machine que l'agent · base jetable dédiée.`,
    `## 1. Bout en bout (un agent réel)`,
    `Agent A1 enrôlé par le parcours réel (jeton → enrôlement → synchro des politiques du seed) en ${f(e.enrollMs)} ms, puis ${e.interactions} interactions : les ${TEXT_E2E_SCENARIOS.length} scénarios texte E2E, ${e.interactions / TEXT_E2E_SCENARIOS.length} fois chacun. Actions : ${Object.entries(e.actions).map(([a, n]) => `${a} ${n}`).join(", ")}.`,
    `| Étape | n | médiane | p95 | p99 | max |`,
    `| :--- | ---: | ---: | ---: | ---: | ---: |`,
    row("Décision locale (détection → score → politique → masquage)", e.local),
    row("Journalisation (POST /evaluate signé, recalcul serveur, écriture)", e.evaluate),
    row("Total attendu par l'utilisateur (intercept)", e.total),
    `Contrôles : ${e.eventsLogged}/${e.interactions} interactions journalisées${e.sameActionsInOrder ? ", avec la même action et dans le même ordre" : " — **écart entre actions locales et journal**"} ; ${e.divergences} divergence(s) agent/serveur ; ${e.escrows}/${e.masks} séquestres pour les MASK ; file hors ligne restante : ${e.queued} ; chaîne d'audit : ${e.chain.breaks} rupture(s) sur ${e.chain.events} événements.`,
  ];
  if (r.levels.length) {
    out.push(
      `## 2. Charge (POST /v1/interactions/evaluate)`,
      `Agents inscrits en base, requêtes signées rejouées en boucle fermée (chaque agent renvoie dès la réponse reçue), ${r.durationS} s par palier.`,
      `| Agents simultanés | Requêtes | Débit | médiane | p95 | p99 | max | Erreurs |`,
      `| ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |`,
      ...r.levels.map(
        (l) =>
          `| ${l.concurrency} | ${l.requests} | ${f(l.throughput)} req/s | ${f(l.latency.p50)} ms | ${f(l.latency.p95)} ms | ${f(l.latency.p99)} ms | ${f(l.latency.max)} ms | ${l.errors === 0 ? "0" : Object.entries(l.errorKinds).map(([k, n]) => `${n} × ${k}`).join(", ")} |`,
      ),
      `Après la charge : ${r.loadEvents.logged} événements journalisés pour ${r.loadEvents.sent} réponses réussies ; chaîne d'audit : **${r.chainAfterLoad!.breaks} rupture(s)** et ${r.chainAfterLoad!.forks} bifurcation(s) (deux événements déclarant le même prédécesseur) sur ${r.chainAfterLoad!.events} événements.`,
    );
  }
  out.push(
    `## Limites`,
    `- Une seule machine : agent, API et base se partagent le processeur ; le réseau (latence, pertes) n'est pas simulé.`,
    `- En charge, les agents rejouent des requêtes déjà décidées : la détection locale, qui tourne sur chaque poste, n'est pas comptée dans la charge serveur.`,
    `- Paliers courts (${r.durationS} s) : pas de mesure d'endurance.`,
  );
  const md = out.reduce((md, line, i, all) => md + (i === 0 ? "" : line.startsWith("|") && all[i - 1]!.startsWith("|") ? "\n" : "\n\n") + line, "");
  const outDir = resolve(args.sortie!);
  mkdirSync(outDir, { recursive: true });
  const suffix = args.moteur === "regles" ? "-sans-ner" : "";
  writeFileSync(join(outDir, `decision-charge${suffix}.md`), md + "\n", "utf8");
  writeFileSync(join(outDir, `decision-charge${suffix}.json`), JSON.stringify(r, null, 2), "utf8");
  log(`rapport : ${join(outDir, `decision-charge${suffix}.md`)}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});

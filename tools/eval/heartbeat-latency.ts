/**
 * Mesure de bout en bout du délai d'alerte « agent manquant » (NFR-03) — `pnpm eval:heartbeat`.
 *
 * Contre l'API et la base réelles, avec leurs réglages réels (signal attendu toutes les
 * 60 s, seuil HEARTBEAT_TIMEOUT_SECONDS, contrôle toutes les HEARTBEAT_CHECK_INTERVAL_SECONDS).
 * N agents simulés sont inscrits en base comme à l'enrôlement, puis envoient de vrais
 * signaux signés (ECDSA P-256) à POST /v1/agents/heartbeat. Chacun est « désactivé » à un
 * instant tiré au hasard, ce qui répartit l'arrêt uniformément entre deux signaux et entre
 * deux contrôles du serveur. On mesure le temps entre la désactivation et l'alerte
 * AGENT_MISSING, toutes les dates venant de l'horloge de la base (pas de dérive client).
 *
 * Chaque agent a sa propre phase d'envoi : le contrôle serveur tombe ainsi à des instants
 * variés par rapport au dernier signal.
 *
 * Les agents de mesure (hostname « mesure-heartbeat-… ») et leurs alertes sont supprimés
 * à la fin, sauf avec --garder.
 *
 * Options :
 *   --agents <n>       agents simulés (défaut 20)
 *   --intervalle <s>   période d'envoi des signaux (défaut 60, comme A1 et A2)
 *   --arret-min <s>    désactivation au plus tôt (défaut 70)
 *   --arret-max <s>    désactivation au plus tard (défaut 190)
 *   --api <url>        défaut http://localhost:4000
 *   --graine <n>       défaut 2026
 *   --sortie <dossier> défaut docs/evaluation/resultats
 *   --garder           ne supprime pas les agents de mesure
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Client } from "pg";
import { DATABASE_URL } from "../../db/scripts/env.js";
import { generateAgentKeyPair, importPrivateKey, randomUuid, signPayload, type HeartbeatPayload } from "../../packages/shared/src/index.js";
import { createRng } from "./rng.js";

const { values: args } = parseArgs({
  options: {
    agents: { type: "string", default: "20" },
    intervalle: { type: "string", default: "60" },
    "arret-min": { type: "string", default: "70" },
    "arret-max": { type: "string", default: "190" },
    api: { type: "string", default: "http://localhost:4000" },
    graine: { type: "string", default: "2026" },
    sortie: { type: "string", default: "docs/evaluation/resultats" },
    garder: { type: "boolean", default: false },
  },
});

const N = Number(args.agents);
const INTERVAL_S = Number(args.intervalle);
const STOP_MIN_S = Number(args["arret-min"]);
const STOP_MAX_S = Number(args["arret-max"]);
const TIMEOUT_S = Number(process.env.HEARTBEAT_TIMEOUT_SECONDS ?? 300);
const CHECK_S = Number(process.env.HEARTBEAT_CHECK_INTERVAL_SECONDS ?? 30);
const log = (msg: string) => console.log(`[heartbeat] ${msg}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface SimAgent {
  id: string;
  key: CryptoKey;
  sequence: number;
  stopAfterS: number;
  /** Prochain envoi : chaque agent a sa propre phase, comme des postes allumés à des heures différentes. */
  nextBeatS: number;
  stopped: boolean;
  stoppedAt: Date | null;
  sent: number;
  failed: number;
}

export interface HeartbeatMeasure {
  agentId: string;
  stopAfterS: number;
  heartbeatsSent: number;
  /** Désactivation → alerte (ce que vit l'organisation). */
  delayFromStopS: number | null;
  /** Dernier signal reçu → alerte (ce que règle le seuil). */
  delayFromLastHeartbeatS: number | null;
  /** Dernier signal → désactivation (phase dans la période d'envoi). */
  stopOffsetS: number;
}

function stats(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))] ?? NaN;
  return { n: s.length, min: s[0] ?? NaN, p50: q(0.5), p95: q(0.95), max: s[s.length - 1] ?? NaN, mean: s.reduce((a, b) => a + b, 0) / Math.max(1, s.length) };
}

async function dbNow(db: Client): Promise<Date> {
  return (await db.query<{ now: Date }>(`SELECT clock_timestamp() AS now`)).rows[0]!.now;
}

async function sendHeartbeat(agent: SimAgent): Promise<void> {
  agent.sequence++;
  const payload: HeartbeatPayload = {
    agentId: agent.id,
    module: "A1",
    sequence: agent.sequence,
    sentAt: new Date().toISOString(),
    agentVersion: "mesure-heartbeat",
    integrity: { agentBundleSha256: null, models: [], localDetectionAvailable: true, layersAvailable: ["rules"] },
    queuedEvents: 0,
    policyVersion: null,
  };
  const signature = await signPayload(agent.key, payload);
  const res = await fetch(`${args.api}/v1/agents/heartbeat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload, signature }),
  });
  if (res.ok) agent.sent++;
  else {
    agent.failed++;
    log(`signal refusé pour ${agent.id.slice(0, 8)} : HTTP ${res.status} ${await res.text()}`);
  }
}

async function main() {
  const health = await fetch(`${args.api}/v1/agents/heartbeat`, { method: "POST", body: "{}" }).catch(() => null);
  if (!health) throw new Error(`API injoignable sur ${args.api} : lancez-la d'abord (pnpm dev:api)`);

  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  const rng = createRng(Number(args.graine));
  const startedAt = await dbNow(db);
  log(`${N} agents · signal toutes les ${INTERVAL_S} s · seuil ${TIMEOUT_S} s · contrôle toutes les ${CHECK_S} s (valeurs de .env)`);

  // Inscription identique à l'enrôlement : last_heartbeat_at = now(), statut ok.
  const agents: SimAgent[] = [];
  for (let i = 0; i < N; i++) {
    const pair = await generateAgentKeyPair();
    const id = randomUuid();
    await db.query(
      `INSERT INTO agent(agent_id, module, user_id, hostname, agent_version, public_key, last_heartbeat_at, integrity_status)
       VALUES ($1,'A1',NULL,$2,'mesure-heartbeat',$3, now(), 'ok')`,
      [id, `mesure-heartbeat-${String(i + 1).padStart(2, "0")}`, JSON.stringify(pair.publicKey)],
    );
    agents.push({
      id,
      key: await importPrivateKey(pair.privateKey),
      sequence: 0,
      stopAfterS: STOP_MIN_S + rng.next() * (STOP_MAX_S - STOP_MIN_S),
      nextBeatS: rng.next() * INTERVAL_S,
      stopped: false,
      stoppedAt: null,
      sent: 0,
      failed: 0,
    });
  }

  const t0 = Date.now();
  const elapsed = () => (Date.now() - t0) / 1000;
  const ids = agents.map((a) => a.id);
  const alerts = new Map<string, Date>();
  const deadline = STOP_MAX_S + TIMEOUT_S + 3 * CHECK_S + 60;

  try {
    while (alerts.size < N && elapsed() < deadline) {
      // Désactivations : l'agent n'envoie plus rien à partir de cet instant.
      for (const a of agents) {
        if (!a.stopped && elapsed() >= a.stopAfterS) {
          a.stopped = true;
          a.stoppedAt = await dbNow(db);
        }
      }
      for (const a of agents) {
        if (!a.stopped && elapsed() >= a.nextBeatS) {
          await sendHeartbeat(a);
          a.nextBeatS += INTERVAL_S;
        }
      }
      const res = await db.query<{ agent_id: string; first: Date }>(
        `SELECT agent_id, min(created_at) AS first FROM security_alert
          WHERE alert_type = 'AGENT_MISSING' AND agent_id = ANY($1::uuid[]) AND created_at >= $2
          GROUP BY agent_id`,
        [ids, startedAt],
      );
      for (const r of res.rows) {
        if (!alerts.has(r.agent_id)) {
          alerts.set(r.agent_id, r.first);
          const a = agents.find((x) => x.id === r.agent_id)!;
          const d = a.stoppedAt ? (r.first.getTime() - a.stoppedAt.getTime()) / 1000 : NaN;
          log(`alerte ${alerts.size}/${N} à ${elapsed().toFixed(0)} s · agent ${r.agent_id.slice(0, 8)} · ${d.toFixed(1)} s après sa désactivation`);
        }
      }
      await sleep(500);
    }

    const rows = await db.query<{ agent_id: string; last_heartbeat_at: Date }>(
      `SELECT agent_id, last_heartbeat_at FROM agent WHERE agent_id = ANY($1::uuid[])`,
      [ids],
    );
    const lastHb = new Map(rows.rows.map((r) => [r.agent_id, r.last_heartbeat_at]));
    const measures: HeartbeatMeasure[] = agents.map((a) => {
      const alert = alerts.get(a.id) ?? null;
      const last = lastHb.get(a.id)!;
      return {
        agentId: a.id,
        stopAfterS: Math.round(a.stopAfterS * 10) / 10,
        heartbeatsSent: a.sent,
        delayFromStopS: alert && a.stoppedAt ? (alert.getTime() - a.stoppedAt.getTime()) / 1000 : null,
        delayFromLastHeartbeatS: alert ? (alert.getTime() - last.getTime()) / 1000 : null,
        stopOffsetS: a.stoppedAt ? (a.stoppedAt.getTime() - last.getTime()) / 1000 : NaN,
      };
    });
    const failed = agents.reduce((s, a) => s + a.failed, 0);
    report(measures, failed);
  } finally {
    if (!args.garder) {
      await db.query(`DELETE FROM security_alert WHERE agent_id = ANY($1::uuid[])`, [ids]);
      await db.query(`DELETE FROM agent WHERE agent_id = ANY($1::uuid[])`, [ids]);
      log(`agents de mesure et alertes supprimés`);
    }
    await db.end();
  }
}

function report(measures: HeartbeatMeasure[], failedHeartbeats: number) {
  const fromStop = stats(measures.flatMap((m) => (m.delayFromStopS === null ? [] : [m.delayFromStopS])));
  const fromLast = stats(measures.flatMap((m) => (m.delayFromLastHeartbeatS === null ? [] : [m.delayFromLastHeartbeatS])));
  const missed = measures.filter((m) => m.delayFromStopS === null).length;
  const f = (x: number) => (Number.isFinite(x) ? x.toFixed(1).replace(".", ",") : "—");
  const theoMin = Math.max(0, TIMEOUT_S - INTERVAL_S);
  const theoMax = TIMEOUT_S + CHECK_S;

  const md = [
    `# Délai d'alerte « agent manquant » — mesure de bout en bout`,
    `Date : ${new Date().toISOString().slice(0, 10)} · ${measures.length} agents simulés · signal toutes les ${INTERVAL_S} s · seuil ${TIMEOUT_S} s · contrôle serveur toutes les ${CHECK_S} s. ` +
      `Désactivation tirée uniformément entre ${STOP_MIN_S} et ${STOP_MAX_S} s après l'inscription ; phase d'envoi propre à chaque agent, tirée dans [0, ${INTERVAL_S}[ s. Dates prises sur l'horloge de la base.`,
    `Signaux refusés par l'API : ${failedHeartbeats}. Agents sans alerte à l'échéance : ${missed}.`,
    `| Délai | n | min | médiane | p95 | max | moyenne | borne théorique |`,
    `| :--- | ---: | ---: | ---: | ---: | ---: | ---: | :--- |`,
    `| Désactivation → alerte | ${fromStop.n} | ${f(fromStop.min)} s | ${f(fromStop.p50)} s | ${f(fromStop.p95)} s | ${f(fromStop.max)} s | ${f(fromStop.mean)} s | ${theoMin}–${theoMax} s |`,
    `| Dernier signal → alerte | ${fromLast.n} | ${f(fromLast.min)} s | ${f(fromLast.p50)} s | ${f(fromLast.p95)} s | ${f(fromLast.max)} s | ${f(fromLast.mean)} s | ${TIMEOUT_S}–${theoMax} s |`,
    `## Détail par agent`,
    `| Agent | Désactivé à | Signaux envoyés | Dernier signal → désactivation | Désactivation → alerte | Dernier signal → alerte |`,
    `| :--- | ---: | ---: | ---: | ---: | ---: |`,
    ...measures
      .sort((a, b) => a.stopAfterS - b.stopAfterS)
      .map((m) => `| ${m.agentId.slice(0, 8)} | ${f(m.stopAfterS)} s | ${m.heartbeatsSent} | ${f(m.stopOffsetS)} s | ${m.delayFromStopS === null ? "aucune alerte" : `${f(m.delayFromStopS)} s`} | ${m.delayFromLastHeartbeatS === null ? "—" : `${f(m.delayFromLastHeartbeatS)} s`} |`),
    `## Limites`,
    `- Agents simulés au signal parfaitement régulier : les retards d'alarme de Chrome (service worker suspendu, mise en veille) et du démon A2 ne sont pas reproduits ; ils ne peuvent qu'allonger le délai.`,
    `- API et base sur la même machine, sans charge ; le délai d'affichage dans le dashboard (rafraîchissement) n'est pas compté.`,
  ].reduce((md, line, i, all) => md + (i === 0 ? "" : line.startsWith("|") && all[i - 1]!.startsWith("|") ? "\n" : "\n\n") + line, "");

  const outDir = resolve(args.sortie);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "heartbeat-latence.md"), md + "\n", "utf8");
  writeFileSync(
    join(outDir, "heartbeat-latence.json"),
    JSON.stringify({ intervalS: INTERVAL_S, timeoutS: TIMEOUT_S, checkS: CHECK_S, failedHeartbeats, fromStop, fromLast, measures }, null, 2),
    "utf8",
  );
  log(`désactivation → alerte : min ${f(fromStop.min)} · médiane ${f(fromStop.p50)} · max ${f(fromStop.max)} s (théorie ${theoMin}–${theoMax} s)`);
  log(`rapport : ${join(outDir, "heartbeat-latence.md")}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

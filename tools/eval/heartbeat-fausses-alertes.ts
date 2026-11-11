/**
 * Fausses alertes « agent manquant » (seconde moitié de H4) — `pnpm eval:heartbeat:fausses-alertes`.
 *
 * Contre l'API et la base réelles, avec leurs réglages réels. Des agents simulés, inscrits en
 * base comme à l'enrôlement, restent actifs bien au-delà du seuil et envoient de vrais signaux
 * signés. Selon leur profil, ils subissent des retards d'envoi (alarmes Chrome, poste chargé)
 * ou des coupures réseau brèves, plus courtes que le seuil. Une alerte AGENT_MISSING sur l'un
 * d'eux est une fausse alerte. Un profil témoin (mise en veille plus longue que le seuil) doit,
 * lui, déclencher l'alerte, puis AGENT_RECOVERED au retour.
 *
 * Profils (graine fixe, phase d'envoi propre à chaque agent) :
 *   continu         signal toutes les 60 s
 *   gigue           chaque signal retardé de 0 à 20 s (alarme Chrome, service worker réveillé tard)
 *   coupure-2/3/4   2, 3 ou 4 signaux perdus d'affilée (écart de 180, 240 ou 300 s)
 *   coupure-4-gigue 4 signaux perdus, avec la gigue (écart de 300 à 320 s)
 *   veille          6 signaux perdus (écart de 420 s) : alerte attendue, puis rétablissement
 *
 * Options : --par-profil <n> (défaut 5) · --duree <s> (défaut 600) · --api <url> · --graine <n>
 *           --sortie <dossier> · --garder
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
    "par-profil": { type: "string", default: "5" },
    duree: { type: "string", default: "600" },
    api: { type: "string", default: "http://localhost:4000" },
    graine: { type: "string", default: "2027" },
    sortie: { type: "string", default: "docs/evaluation/resultats" },
    garder: { type: "boolean", default: false },
  },
});

const PER_PROFILE = Number(args["par-profil"]);
const DURATION_S = Number(args.duree);
const INTERVAL_S = 60;
const TIMEOUT_S = Number(process.env.HEARTBEAT_TIMEOUT_SECONDS ?? 300);
const CHECK_S = Number(process.env.HEARTBEAT_CHECK_INTERVAL_SECONDS ?? 30);
const log = (msg: string) => console.log(`[fausses-alertes] ${msg}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Profile {
  id: string;
  label: string;
  /** Retard maximal ajouté à chaque période (s). */
  jitterS: number;
  /** Signaux perdus d'affilée, à partir du 3e. */
  skipped: number;
  /** Une alerte est-elle attendue (écart > seuil) ? */
  alertExpected: boolean;
}

const PROFILES: Profile[] = [
  { id: "continu", label: "Signal régulier", jitterS: 0, skipped: 0, alertExpected: false },
  { id: "gigue", label: "Signal retardé de 0 à 20 s", jitterS: 20, skipped: 0, alertExpected: false },
  { id: "coupure-2", label: "Coupure : 2 signaux perdus", jitterS: 0, skipped: 2, alertExpected: false },
  { id: "coupure-3", label: "Coupure : 3 signaux perdus", jitterS: 0, skipped: 3, alertExpected: false },
  { id: "coupure-4", label: "Coupure : 4 signaux perdus", jitterS: 0, skipped: 4, alertExpected: false },
  { id: "coupure-4-gigue", label: "Coupure : 4 signaux perdus, avec retard", jitterS: 20, skipped: 4, alertExpected: false },
  { id: "veille", label: "Mise en veille : 6 signaux perdus (témoin)", jitterS: 0, skipped: 6, alertExpected: true },
];

interface SimAgent {
  id: string;
  profile: Profile;
  key: CryptoKey;
  sequence: number;
  beatIndex: number;
  nextBeatS: number;
  sentAtS: number[];
  failed: number;
}

async function sendHeartbeat(agent: SimAgent): Promise<boolean> {
  agent.sequence++;
  const payload: HeartbeatPayload = {
    agentId: agent.id,
    module: "A1",
    sequence: agent.sequence,
    sentAt: new Date().toISOString(),
    agentVersion: "mesure-fausses-alertes",
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
  if (!res.ok) {
    agent.failed++;
    log(`signal refusé pour ${agent.id.slice(0, 8)} : HTTP ${res.status} ${await res.text()}`);
  }
  return res.ok;
}

async function main() {
  const health = await fetch(`${args.api}/v1/agents/heartbeat`, { method: "POST", body: "{}" }).catch(() => null);
  if (!health) throw new Error(`API injoignable sur ${args.api} : lancez-la d'abord (pnpm dev:api)`);
  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  const rng = createRng(Number(args.graine));
  const startedAt = (await db.query<{ now: Date }>(`SELECT clock_timestamp() AS now`)).rows[0]!.now;
  log(`${PROFILES.length} profils × ${PER_PROFILE} agents · ${DURATION_S} s · seuil ${TIMEOUT_S} s · contrôle toutes les ${CHECK_S} s`);

  const agents: SimAgent[] = [];
  for (const profile of PROFILES) {
    for (let i = 0; i < PER_PROFILE; i++) {
      const pair = await generateAgentKeyPair();
      const id = randomUuid();
      await db.query(
        `INSERT INTO agent(agent_id, module, user_id, hostname, agent_version, public_key, last_heartbeat_at, integrity_status)
         VALUES ($1,'A1',NULL,$2,'mesure-fausses-alertes',$3, now(), 'ok')`,
        [id, `mesure-fa-${profile.id}-${i + 1}`, JSON.stringify(pair.publicKey)],
      );
      agents.push({
        id,
        profile,
        key: await importPrivateKey(pair.privateKey),
        sequence: 0,
        beatIndex: 0,
        // Premier signal dans la première période (l'inscription vaut signal initial).
        nextBeatS: rng.next() * INTERVAL_S,
        sentAtS: [0],
        failed: 0,
      });
    }
  }

  const ids = agents.map((a) => a.id);
  const t0 = Date.now();
  const elapsed = () => (Date.now() - t0) / 1000;
  try {
    let lastLog = 0;
    let lastLoopS = 0;
    while (elapsed() < DURATION_S) {
      for (const a of agents) {
        if (elapsed() < a.nextBeatS) continue;
        const lost = a.beatIndex >= 2 && a.beatIndex < 2 + a.profile.skipped;
        if (!lost && (await sendHeartbeat(a))) a.sentAtS.push(elapsed());
        a.beatIndex++;
        a.nextBeatS += INTERVAL_S + rng.next() * a.profile.jitterS;
      }
      if (elapsed() - lastLog >= 60) {
        lastLog = elapsed();
        log(`${elapsed().toFixed(0)} s / ${DURATION_S} s`);
      }
      await sleep(250);
      // Une boucle de 250 ms qui dure plus de 10 s : le poste s'est mis en veille, la mesure ne vaut rien.
      const now = elapsed();
      if (now - lastLoopS > 10) throw new Error(`Interruption de ${(now - lastLoopS).toFixed(0)} s à ${lastLoopS.toFixed(0)} s (mise en veille ?) : mesure invalide`);
      lastLoopS = now;
    }
    // Laisser passer un dernier contrôle serveur.
    await sleep((CHECK_S + 2) * 1000);

    const alerts = await db.query<{ agent_id: string; alert_type: string; n: string }>(
      `SELECT agent_id, alert_type, count(*)::text AS n FROM security_alert
        WHERE agent_id = ANY($1::uuid[]) AND created_at >= $2 AND alert_type IN ('AGENT_MISSING','AGENT_RECOVERED')
        GROUP BY agent_id, alert_type`,
      [ids, startedAt],
    );
    const count = (id: string, type: string) => Number(alerts.rows.find((r) => r.agent_id === id && r.alert_type === type)?.n ?? 0);
    const rows = PROFILES.map((p) => {
      const group = agents.filter((a) => a.profile === p);
      const gaps = group.map((a) => Math.max(...a.sentAtS.slice(1).map((t, i) => t - a.sentAtS[i]!)));
      const missing = group.filter((a) => count(a.id, "AGENT_MISSING") > 0).length;
      const recovered = group.filter((a) => count(a.id, "AGENT_RECOVERED") > 0).length;
      return {
        profile: p.id,
        label: p.label,
        agents: group.length,
        heartbeats: group.reduce((s, a) => s + a.sentAtS.length - 1, 0),
        failed: group.reduce((s, a) => s + a.failed, 0),
        maxGapMinS: Math.min(...gaps),
        maxGapMaxS: Math.max(...gaps),
        alertExpected: p.alertExpected,
        agentsWithMissingAlert: missing,
        agentsWithRecovered: recovered,
        falseAlerts: p.alertExpected ? 0 : missing,
        missedAlerts: p.alertExpected ? group.length - missing : 0,
      };
    });
    report(rows);
  } finally {
    if (!args.garder) {
      await db.query(`DELETE FROM security_alert WHERE agent_id = ANY($1::uuid[])`, [ids]);
      await db.query(`DELETE FROM agent WHERE agent_id = ANY($1::uuid[])`, [ids]);
      log(`agents de mesure et alertes supprimés`);
    }
    await db.end();
  }
}

type Row = {
  profile: string;
  label: string;
  agents: number;
  heartbeats: number;
  failed: number;
  maxGapMinS: number;
  maxGapMaxS: number;
  alertExpected: boolean;
  agentsWithMissingAlert: number;
  agentsWithRecovered: number;
  falseAlerts: number;
  missedAlerts: number;
};

function report(rows: Row[]) {
  const f = (x: number) => x.toFixed(0);
  const legit = rows.filter((r) => !r.alertExpected);
  const falseAlerts = legit.reduce((s, r) => s + r.falseAlerts, 0);
  const legitAgents = legit.reduce((s, r) => s + r.agents, 0);
  const md = [
    `# Fausses alertes « agent manquant » — mesure de bout en bout`,
    `Date : ${new Date().toISOString().slice(0, 10)} · ${rows.reduce((s, r) => s + r.agents, 0)} agents simulés pendant ${DURATION_S} s · signal attendu toutes les ${INTERVAL_S} s · seuil ${TIMEOUT_S} s · contrôle serveur toutes les ${CHECK_S} s (réglages réels de l'API).`,
    `Fausses alertes : **${falseAlerts} agent(s) sur ${legitAgents}** restés actifs. Signaux refusés par l'API : ${rows.reduce((s, r) => s + r.failed, 0)}.`,
    `| Profil | Agents | Signaux reçus | Plus long écart entre deux signaux | Alerte attendue | Agents alertés « manquant » | Rétablissements signalés |`,
    `| :--- | ---: | ---: | :--- | :--- | ---: | ---: |`,
    ...rows.map(
      (r) =>
        `| ${r.label} | ${r.agents} | ${r.heartbeats} | ${r.maxGapMinS === r.maxGapMaxS ? f(r.maxGapMinS) : `${f(r.maxGapMinS)}–${f(r.maxGapMaxS)}`} s | ${r.alertExpected ? "oui" : "non"} | ${r.agentsWithMissingAlert} | ${r.agentsWithRecovered} |`,
    ),
    `## Lecture`,
    `- Une alerte part quand un contrôle trouve un dernier signal plus vieux que ${TIMEOUT_S} s. Avec un signal toutes les ${INTERVAL_S} s, l'agent peut perdre jusqu'à ${Math.floor(TIMEOUT_S / INTERVAL_S) - 1} signaux d'affilée sans alerte ; au ${Math.floor(TIMEOUT_S / INTERVAL_S)}e, l'écart atteint le seuil, et tout retard d'envoi le fait dépasser.`,
    `- Les écarts sont mesurés côté agent simulé entre deux signaux acceptés.`,
    `## Limites`,
    `- Retards et coupures simulés (gigue uniforme, pertes d'affilée) : la distribution réelle des retards d'alarme Chrome et des coupures réseau n'est pas connue.`,
    `- API et base sur la même machine ; une indisponibilité de l'API elle-même (redémarrage) n'est pas testée ici : au retour, tous les agents dont le dernier signal dépasse le seuil seraient alertés au premier contrôle.`,
  ].reduce((md, line, i, all) => md + (i === 0 ? "" : line.startsWith("|") && all[i - 1]!.startsWith("|") ? "\n" : "\n\n") + line, "");
  const outDir = resolve(args.sortie);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "heartbeat-fausses-alertes.md"), md + "\n", "utf8");
  writeFileSync(
    join(outDir, "heartbeat-fausses-alertes.json"),
    JSON.stringify({ durationS: DURATION_S, intervalS: INTERVAL_S, timeoutS: TIMEOUT_S, checkS: CHECK_S, rows }, null, 2),
    "utf8",
  );
  for (const r of rows) log(`${r.profile} : ${r.agentsWithMissingAlert}/${r.agents} alertés (attendu : ${r.alertExpected ? "oui" : "non"}), écart max ${f(r.maxGapMaxS)} s`);
  log(`rapport : ${join(outDir, "heartbeat-fausses-alertes.md")}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

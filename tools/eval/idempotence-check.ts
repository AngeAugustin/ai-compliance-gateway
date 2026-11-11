/**
 * Vérification ponctuelle de l'idempotence de POST /v1/interactions/evaluate (base jetable …_charge) :
 * le même événement envoyé deux fois, puis cinq fois en parallèle, ne doit être journalisé qu'une fois.
 */
import { Client } from "pg";
import { DATABASE_URL, databaseNameFromUrl } from "../../db/scripts/env.js";
import { GatewayClient } from "../../packages/agent-runtime/src/client.js";
import { generateAgentKeyPair, importPrivateKey, randomUuid, type EvaluateInteractionRequest } from "../../packages/shared/src/index.js";

async function main() {
  if (!databaseNameFromUrl(DATABASE_URL).endsWith("_charge")) throw new Error("base jetable …_charge requise");
  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  const user = (await db.query<{ id: string }>(`SELECT id FROM app_user WHERE role = 'USER' LIMIT 1`)).rows[0]!;
  const pair = await generateAgentKeyPair();
  const agentId = randomUuid();
  await db.query(
    `INSERT INTO agent(agent_id, module, user_id, hostname, agent_version, public_key, last_heartbeat_at, integrity_status)
     VALUES ($1,'A1',$2,'mesure-idempotence','test',$3, now(), 'ok')`,
    [agentId, user.id, JSON.stringify(pair.publicKey)],
  );
  const key = await importPrivateKey(pair.privateKey);
  const client = new GatewayClient("http://localhost:4000", async () => key, () => agentId);
  const body = (): EvaluateInteractionRequest => ({
    interactionId: randomUuid(),
    agentId,
    aiServiceId: "chatgpt.com",
    channel: "browser",
    detectionResults: [{ layer: "rules", entities: [], processingTimeMs: 1, modelVersion: "test", degraded: false }],
    textLength: 10,
    attachments: [],
    occurredAt: new Date().toISOString(),
    localDecision: { action: "ALLOW", policyId: null, riskScore: 5, riskBand: "low", factorBreakdown: [], degradedMode: false, maskedTokens: [] },
  });
  const count = async (id: string) =>
    Number((await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM analytics.security_event WHERE interaction_id = $1`, [id])).rows[0]!.n);

  const a = body();
  const r1 = await client.evaluate(a);
  const r2 = await client.evaluate(a);
  console.log(`renvoi séquentiel : ${await count(a.interactionId)} événement(s), même eventId : ${r1.eventId === r2.eventId}`);

  const b = body();
  const rs = await Promise.all(Array.from({ length: 5 }, () => client.evaluate(b)));
  console.log(`5 renvois simultanés : ${await count(b.interactionId)} événement(s), eventId identiques : ${new Set(rs.map((r) => r.eventId)).size === 1}`);
  await db.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Préparation d'une séance d'utilisabilité — `pnpm utilisabilite:preparer`.
 * À lancer après `pnpm db:reset` et `pnpm db:demo-events`, API lancée, avant chaque participant.
 *
 * 1. Ajoute le collaborateur fictif qui « a quitté la CNSS » (tâche 9), distinct de Marie Agbodji (tâche 8).
 * 2. Fait passer un vrai prompt masqué par un agent enrôlé au nom de Marie Agbodji : la tâche 4 a besoin
 *    d'un événement avec valeurs sous séquestre, que les événements de démonstration ne créent pas.
 * 3. Affiche la fiche réponses de l'observateur : bonnes réponses des tâches 2 et 3, événement à désigner
 *    pour la tâche 4, calculés sur la base telle qu'elle est.
 *
 * Options : --api <url> (défaut http://localhost:4000).
 * Refuse une base dont le nom ne contient pas « ai_compliance_gateway ».
 */
import { createHash, randomBytes, scrypt } from "node:crypto";
import { parseArgs, promisify } from "node:util";
import { Client } from "pg";
import { AgentRuntime, memoryConfigStore } from "../../packages/agent-runtime/src/index.js";
import { DetectionEngine } from "../../packages/detection-engine/src/index.js";
import { DATABASE_URL, databaseNameFromUrl } from "../../db/scripts/env.js";

const { values: args } = parseArgs({ options: { api: { type: "string", default: "http://localhost:4000" } } });

const DEPART = { email: "rodrigue.hounkpe@cnss.bj", name: "Rodrigue Hounkpè (Finance)", department: "Finance" };

/** Prompt P3 du protocole des vrais sites : numéro d'assuré + e-mail, masqué par la politique « Identifiants CNSS ». */
const MASKED_PROMPT = "Rédige un courrier pour l'assuré n° CNSS A12345678 (koffi.adjovi@exemple.bj) au sujet de son dossier.";

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await promisify(scrypt)(password, salt, 32)) as Buffer;
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

/** Interaction réelle : enrôlement par jeton, décision locale, journalisation signée et séquestre côté serveur. */
async function maskedInteraction(db: Client): Promise<string> {
  try {
    await fetch(args.api!, { signal: AbortSignal.timeout(3000) });
  } catch {
    return `API injoignable sur ${args.api} : lancez-la (pnpm dev) puis relancez ce script`;
  }
  const marie = (await db.query<{ id: string }>(`SELECT id FROM app_user WHERE email = 'marie.agbodji@cnss.bj'`)).rows[0];
  if (!marie) return "Marie Agbodji absente : lancez pnpm db:reset";
  const token = `preparation-${randomBytes(8).toString("hex")}`;
  await db.query(
    `INSERT INTO enrollment_token(token_hash, modules, user_id, expires_at) VALUES ($1, ARRAY['A1'], $2, now() + interval '10 minutes')`,
    [createHash("sha256").update(token).digest("hex"), marie.id],
  );
  const engine = new DetectionEngine();
  await engine.initialize();
  const runtime = new AgentRuntime({
    module: "A1",
    store: memoryConfigStore({ apiUrl: args.api! }),
    engine: engine as unknown as ConstructorParameters<typeof AgentRuntime>[0]["engine"],
  });
  await runtime.start({ heartbeat: false });
  await runtime.configure(args.api!, token);
  await runtime.enroll("poste-preparation-seance", "0.1.0", { heartbeat: false });
  const d = await runtime.intercept(MASKED_PROMPT, "browser", "chatgpt.com");
  return `prompt masqué envoyé par un agent enrôlé (décision ${d.decision.action})`;
}

async function main() {
  const dbName = databaseNameFromUrl(DATABASE_URL);
  if (!dbName.includes("ai_compliance_gateway")) throw new Error(`Base « ${dbName} » inattendue.`);
  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  try {
    await db.query(
      `INSERT INTO app_user(email, display_name, password_hash, department, role, jurisdiction)
       VALUES ($1, $2, $3, $4, 'USER', 'BJ') ON CONFLICT (email) DO UPDATE SET is_active = true`,
      [DEPART.email, DEPART.name, await hashPassword(randomBytes(12).toString("base64url")), DEPART.department],
    );
    console.log(`Préparation tâche 4 : ${await maskedInteraction(db)}`);

    const blocked = await db.query<{ n: string }>(
      `SELECT count(*)::text n FROM analytics.security_event WHERE action = 'BLOCK' AND occurred_at >= now() - interval '7 days'`,
    );
    const byDept = await db.query<{ department: string; n: string }>(
      `SELECT department, count(*)::text n FROM analytics.security_event
       WHERE action = 'BLOCK' AND occurred_at >= now() - interval '7 days' GROUP BY 1 ORDER BY count(*) DESC LIMIT 3`,
    );
    const apiKey = await db.query<{ occurred_at: Date; ai_service_id: string | null; department: string }>(
      `SELECT occurred_at, ai_service_id, department FROM analytics.security_event
       WHERE action = 'BLOCK' AND 'API_KEY' = ANY(entities_detected) ORDER BY occurred_at DESC LIMIT 1`,
    );
    const escrow = await db.query<{ occurred_at: Date; department: string; ai_service_id: string | null; entities: string[] }>(
      `SELECT e.occurred_at, e.department, e.ai_service_id, e.entities_detected AS entities FROM analytics.security_event e
       WHERE e.action = 'MASK' AND EXISTS (SELECT 1 FROM vault.escrow v WHERE v.interaction_id = e.interaction_id)
       ORDER BY e.occurred_at DESC LIMIT 1`,
    );

    const d = (t: Date) => t.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
    console.log("\n=== Fiche réponses de l'observateur (ne pas montrer au participant) ===\n");
    console.log(`Tâche 2 — blocages sur 7 jours : ${blocked.rows[0]?.n ?? 0}`);
    console.log(`         direction la plus bloquée : ${byDept.rows.map((r) => `${r.department} (${r.n})`).join(", ") || "aucune"}`);
    const k = apiKey.rows[0];
    console.log(`Tâche 3 — dernier blocage clé d'API : ${k ? `${d(k.occurred_at)}, ${k.department}, service ${k.ai_service_id ?? "(non renseigné)"}` : "AUCUN — tâche 3 impossible, vérifier db:demo-events"}`);
    const m = escrow.rows[0];
    console.log(`Tâche 4 — événement à désigner : ${m ? `MASK du ${d(m.occurred_at)}, ${m.department}, ${m.ai_service_id ?? "?"}, ${m.entities.join(", ")}` : "AUCUN événement avec séquestre — tâche 4 impossible"}`);
    console.log(`Tâche 8 — collaborateur à enrôler : Marie Agbodji (Cotisations)`);
    console.log(`Tâche 9 — collaborateur parti : ${DEPART.name}, ${DEPART.email}`);
    console.log(`\nComptes : RSSI rssi@cnss.bj · DPO dpo@cnss.bj (mots de passe affichés par pnpm db:reset)\n`);
  } finally {
    await db.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });

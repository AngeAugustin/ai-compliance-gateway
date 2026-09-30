import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { config } from "dotenv";
import { computeEventHash, hashUserId, type SecurityEventHashInput } from "../../packages/shared/dist/index.js";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.example"), override: false });

const SERVICES = [
  { id: "chatgpt.com", region: "US" },
  { id: "claude.ai", region: "US" },
  { id: "gemini.google.com", region: "US" },
  { id: "copilot.microsoft.com", region: "US" },
  { id: "chat.deepseek.com", region: "CN" },
  { id: "chat.mistral.ai", region: "EU" },
] as const;

const DEPARTMENTS = ["Cotisations", "Finance", "Juridique", "RH", "Technique", "Direction"] as const;
const CHANNELS = ["browser", "cli", "api"] as const;

type Scenario = {
  action: "ALLOW" | "WARN" | "MASK" | "BLOCK";
  band: "low" | "moderate" | "high" | "critical";
  score: number;
  entities: string[];
  department?: (typeof DEPARTMENTS)[number];
  frameworks: string[];
};

const SCENARIOS: Scenario[] = [
  { action: "ALLOW", band: "low", score: 12, entities: [], frameworks: ["NIST-GOVERN"] },
  { action: "ALLOW", band: "low", score: 18, entities: ["ORGANIZATION"], frameworks: ["NIST-GOVERN"] },
  { action: "ALLOW", band: "moderate", score: 32, entities: ["EMAIL"], department: "RH", frameworks: ["NIST-MEASURE"] },
  { action: "WARN", band: "high", score: 58, entities: ["PERSON", "EMAIL"], department: "Direction", frameworks: ["NIST-MEASURE"] },
  { action: "WARN", band: "high", score: 62, entities: ["JOB_TITLE", "ORGANIZATION"], department: "Juridique", frameworks: ["NIST-MEASURE"] },
  {
    action: "MASK",
    band: "high",
    score: 71,
    entities: ["CNSS_INSURED_NUMBER", "PERSON"],
    department: "Cotisations",
    frameworks: ["MALABO-ART14", "APDP-BJ"],
  },
  {
    action: "MASK",
    band: "high",
    score: 68,
    entities: ["FINANCIAL_AMOUNT", "MOBILE_MONEY"],
    department: "Finance",
    frameworks: ["OWASP-LLM02", "MALABO-ART14"],
  },
  {
    action: "MASK",
    band: "moderate",
    score: 44,
    entities: ["NATIONAL_ID"],
    department: "RH",
    frameworks: ["MALABO-ART14"],
  },
  {
    action: "BLOCK",
    band: "critical",
    score: 88,
    entities: ["API_KEY", "PASSWORD"],
    department: "Technique",
    frameworks: ["OWASP-LLM02", "NIST-MANAGE"],
  },
  {
    action: "BLOCK",
    band: "critical",
    score: 91,
    entities: ["MEDICAL", "PERSON"],
    department: "RH",
    frameworks: ["OWASP-LLM02", "MALABO-ART14"],
  },
  {
    action: "BLOCK",
    band: "critical",
    score: 84,
    entities: ["SALARY", "CNSS_EMPLOYER_NUMBER", "PERSON"],
    department: "Finance",
    frameworks: ["NIST-MANAGE"],
  },
];

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)]!;
}

function countEntities(types: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of types) out[t] = (out[t] ?? 0) + 1;
  return out;
}

function breakdown(score: number) {
  const weights = [
    { factor: "entity_sensitivity" as const, weight: 0.4 },
    { factor: "quasi_identifier_combination" as const, weight: 0.25 },
    { factor: "hosting_location" as const, weight: 0.2 },
    { factor: "organizational_context" as const, weight: 0.15 },
  ];
  return weights.map((w) => ({
    factor: w.factor,
    rawScore: score,
    weight: w.weight,
    contribution: Math.round(score * w.weight * 10) / 10,
    explanation: "Jeu de démonstration (catégories uniquement, aucune valeur en clair).",
  }));
}

export async function insertDemoEvents(
  client: Client,
  opts: { userId: string; salt: string; skipIfAny?: boolean; count?: number },
): Promise<number> {
  if (opts.skipIfAny) {
    const existing = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM analytics.security_event`);
    if (Number(existing.rows[0]?.n ?? 0) >= 40) return 0;
  }

  const last = await client.query<{ event_hash: string }>(
    `SELECT event_hash FROM analytics.security_event ORDER BY sequence DESC LIMIT 1`,
  );
  let prevEventHash: string | null = last.rows[0]?.event_hash ?? null;
  const userIdHash = await hashUserId(opts.userId, opts.salt);
  const rand = mulberry32(20260928);
  const total = opts.count ?? 96;
  const now = Date.now();
  let inserted = 0;

  for (let i = 0; i < total; i++) {
    const scenario = pick(rand, SCENARIOS);
    const service = pick(rand, SERVICES);
    const department = scenario.department ?? pick(rand, DEPARTMENTS);
    const occurred = new Date(now - Math.floor(rand() * 6.5 * 24 * 3600_000) - i * 90_000);
    const eventId = randomUUID();
    const occurredAt = occurred.toISOString();
    const payload: SecurityEventHashInput = {
      eventId,
      occurredAt,
      userIdHash,
      department,
      agentId: null,
      channel: pick(rand, CHANNELS),
      aiServiceId: service.id,
      hostingRegion: service.region,
      entitiesDetected: scenario.entities,
      entityCounts: countEntities(scenario.entities),
      contextCategory: department === "Finance" ? "financial" : department === "RH" ? "hr" : null,
      riskScore: scenario.score,
      riskBand: scenario.band,
      factorBreakdown: breakdown(scenario.score),
      policyId: null,
      action: scenario.action,
      referenceFrameworks: scenario.frameworks,
      degradedMode: rand() < 0.04,
      processingTimeMs: 40 + Math.floor(rand() * 220),
      detectionLayers: rand() < 0.7 ? ["rules"] : ["rules", "keyword-context"],
      prevEventHash,
    };
    const eventHash = await computeEventHash(payload);

    await client.query(
      `INSERT INTO analytics.security_event (
         event_id, occurred_at, user_id_hash, department, agent_id, channel, ai_service_id, hosting_region,
         entities_detected, entity_counts, context_category, risk_score, risk_band, factor_breakdown,
         policy_id, action, reference_frameworks, degraded_mode, processing_time_ms, detection_layers,
         prev_event_hash, event_hash, client_ip
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
       )`,
      [
        eventId,
        occurredAt,
        userIdHash,
        department,
        null,
        payload.channel,
        service.id,
        service.region,
        scenario.entities,
        JSON.stringify(payload.entityCounts),
        payload.contextCategory,
        scenario.score,
        scenario.band,
        JSON.stringify(payload.factorBreakdown),
        null,
        scenario.action,
        scenario.frameworks,
        payload.degradedMode,
        payload.processingTimeMs,
        payload.detectionLayers,
        prevEventHash,
        eventHash,
        `10.20.${Math.floor(rand() * 40) + 1}.${Math.floor(rand() * 250) + 2}`,
      ],
    );
    prevEventHash = eventHash;
    inserted++;
  }

  return inserted;
}

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/ai_compliance_gateway";
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const user = await client.query<{ id: string }>(
      `SELECT id FROM app_user WHERE email = $1`,
      [process.env.SEED_COLLAB_EMAIL ?? "marie.agbodji@cnss.bj"],
    );
    if (!user.rows[0]) throw new Error("Aucun utilisateur de démo. Exécutez d'abord pnpm db:seed.");
    const n = await insertDemoEvents(client, {
      userId: user.rows[0].id,
      salt: process.env.AUDIT_USER_SALT ?? "dev-only-audit-salt",
      skipIfAny: true,
    });
    console.log(n === 0 ? "Événements de démo déjà présents — rien à insérer." : `${n} événements de démo insérés.`);
  } finally {
    await client.end();
  }
}

const invoked = process.argv[1]?.replaceAll("\\", "/").endsWith("/db/scripts/demo-events.ts");
if (invoked) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

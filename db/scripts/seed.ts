import { resolve } from "node:path";
import { scrypt, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { Client } from "pg";
import { config } from "dotenv";
import {
  DEFAULT_AI_SERVICES,
  DEFAULT_REGULATORY_FRAMEWORKS,
  DEFAULT_RISK_BAND_THRESHOLDS,
  DEFAULT_RISK_WEIGHTS,
} from "../../packages/shared/dist/index.js";
import { insertDemoEvents } from "./demo-events.js";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.example"), override: false });

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, 32)) as Buffer;
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/ai_compliance_gateway";
  const frameworkId = process.env.REGULATORY_FRAMEWORK ?? "BJ_MALABO";

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");

  await client.query(`TRUNCATE vault.access_log, vault.anonymization_mapping, analytics.security_event,
    security_alert, enrollment_token_redemption, enrollment_token, agent, admin_audit_log, policy_version, policy,
    risk_factor_weight, risk_band_threshold, app_user,
    reference.ai_service, reference.department, reference.regulatory_framework
    RESTART IDENTITY CASCADE`);

  for (const d of [
    ["Cotisations", "high"],
    ["Finance", "high"],
    ["Juridique", "high"],
    ["RH", "moderate"],
    ["Technique", "low"],
    ["Direction", "moderate"],
    ["Generique", "moderate"],
  ]) {
    await client.query(`INSERT INTO reference.department(name, risk_history_level) VALUES ($1, $2)`, d);
  }

  for (const fw of DEFAULT_REGULATORY_FRAMEWORKS) {
    await client.query(
      `INSERT INTO reference.regulatory_framework(id, name, description, applicable_jurisdictions, component_references, is_active)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [fw.id, fw.name, fw.description, fw.applicableJurisdictions, JSON.stringify(fw.componentReferences), fw.id === frameworkId],
    );
  }

  for (const s of DEFAULT_AI_SERVICES) {
    await client.query(
      `INSERT INTO reference.ai_service(id, name, hosting_region, risk_baseline, free_access, domains, cli_commands)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [s.id, s.name, s.hostingRegion, s.riskBaseline, s.freeAccess, s.domains, s.cliCommands],
    );
  }

  const rssiHash = await hashPassword(process.env.SEED_ADMIN_PASSWORD ?? "Admin!2026");
  const dpoHash = await hashPassword(process.env.SEED_DPO_PASSWORD ?? "Dpo!2026");
  const userHash = await hashPassword("User!2026");

  const rssi = await client.query(
    `INSERT INTO app_user(email, display_name, password_hash, department, role, jurisdiction)
     VALUES ($1,$2,$3,'Direction','RSSI','BJ') RETURNING id`,
    [process.env.SEED_ADMIN_EMAIL ?? "rssi@cnss.bj", "Komlan Adjo (RSSI)", rssiHash],
  );
  const dpo = await client.query(
    `INSERT INTO app_user(email, display_name, password_hash, department, role, jurisdiction)
     VALUES ($1,$2,$3,'Juridique','DPO','BJ') RETURNING id`,
    [process.env.SEED_DPO_EMAIL ?? "dpo@cnss.bj", "Aminata Sossou (DPO)", dpoHash],
  );
  const collab = await client.query(
    `INSERT INTO app_user(email, display_name, password_hash, department, role, jurisdiction)
     VALUES ($1,$2,$3,'Cotisations','USER','BJ') RETURNING id`,
    ["marie.agbodji@cnss.bj", "Marie Agbodji (Cotisations)", userHash],
  );
  const rssiId = rssi.rows[0].id as string;
  const collabId = collab.rows[0].id as string;
  void dpo;

  for (const [name, weight] of Object.entries(DEFAULT_RISK_WEIGHTS)) {
    await client.query(`INSERT INTO risk_factor_weight(factor_name, weight, updated_by) VALUES ($1,$2,$3)`, [name, weight, rssiId]);
  }
  for (const [band, range] of Object.entries(DEFAULT_RISK_BAND_THRESHOLDS)) {
    await client.query(`INSERT INTO risk_band_threshold(band, min_score, max_score) VALUES ($1,$2,$3)`, [band, range[0], range[1]]);
  }

  const policies = [
    {
      name: "Bloquer les secrets techniques",
      description: "Clés, mots de passe, clés privées et chaînes de connexion ne quittent jamais le poste.",
      condition: `any_of(entity_type, ["API_KEY", "PASSWORD", "PRIVATE_KEY", "CONNECTION_STRING"])`,
      action: "BLOCK",
      priority: 1,
      frameworks: ["OWASP-LLM02", "NIST-MANAGE"],
    },
    {
      name: "Bloquer les données médicales",
      description: "Données de santé : interdiction de transfert vers un LLM externe.",
      condition: `contains(entity_type, "MEDICAL")`,
      action: "BLOCK",
      priority: 2,
      frameworks: ["OWASP-LLM02", "MALABO-ART14"],
    },
    {
      name: "Fail-closed directions à risque élevé",
      description: "Si la détection est dégradée dans une direction sensible, bloquer.",
      condition: `degraded_mode = true AND department IN ["Cotisations", "Finance", "Juridique"]`,
      action: "BLOCK",
      priority: 5,
      frameworks: ["NIST-MANAGE"],
    },
    {
      name: "Donnée financière + service hébergé hors juridiction",
      description: "Règle exemple du DAT §10.1",
      condition: `risk_band >= "high" AND contains(entity_type, "FINANCIAL_AMOUNT") AND ai_service.hosting_region != user.jurisdiction`,
      action: "MASK",
      priority: 10,
      frameworks: ["OWASP-LLM02", "NIST-MEASURE", "MALABO-ART14"],
    },
    {
      name: "Identifiants CNSS",
      description: "Numéros d'assuré / employeur : masquage systématique.",
      condition: `any_of(entity_type, ["CNSS_INSURED_NUMBER", "CNSS_EMPLOYER_NUMBER", "NATIONAL_ID"])`,
      action: "MASK",
      priority: 12,
      frameworks: ["MALABO-ART14", "APDP-BJ"],
    },
    {
      name: "Combinaison de quasi-identifiants",
      description: "Risque de ré-identification (H2).",
      condition: `quasi_identifier_count >= 3`,
      action: "MASK",
      priority: 20,
      frameworks: ["OWASP-LLM02", "NIST-MEASURE"],
    },
    {
      name: "Bande critique",
      description: "Score ≥ 75 : blocage.",
      condition: `risk_band = "critical"`,
      action: "BLOCK",
      priority: 8,
      frameworks: ["NIST-MANAGE"],
    },
    {
      name: "Avertir sur bande high",
      description: "Exposition notable sans déclencheur plus sévère.",
      condition: `risk_band >= "high"`,
      action: "WARN",
      priority: 80,
      frameworks: ["NIST-MEASURE"],
    },
  ];

  for (const p of policies) {
    const row = await client.query(
      `INSERT INTO policy(name, description, condition_expr, action, priority, reference_frameworks, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, version`,
      [p.name, p.description, p.condition, p.action, p.priority, p.frameworks, rssiId],
    );
    await client.query(
      `INSERT INTO policy_version(policy_id, version, name, condition_expr, action, priority, enabled, reference_frameworks, changed_by)
       VALUES ($1,$2,$3,$4,$5,$6,true,$7,$8)`,
      [row.rows[0].id, row.rows[0].version, p.name, p.condition, p.action, p.priority, p.frameworks, rssiId],
    );
  }

  const demoCount = await insertDemoEvents(client, {
    userId: collabId,
    salt: process.env.AUDIT_USER_SALT ?? "dev-only-audit-salt",
  });

  await client.query("COMMIT");
  console.log("Seed OK");
  console.log(`  ${demoCount} événements de démonstration (Dashboard BI)`);
  console.log("  RSSI  rssi@cnss.bj / Admin!2026");
  console.log("  DPO   dpo@cnss.bj / Dpo!2026");
  console.log("  USER  marie.agbodji@cnss.bj / User!2026");
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


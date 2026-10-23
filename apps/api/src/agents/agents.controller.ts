import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Req, UnauthorizedException } from "@nestjs/common";
import {
  CreateEnrollmentTokenSchema,
  EnrollAgentRequestSchema,
  HeartbeatPayloadSchema,
  SignedHeartbeatSchema,
  importPublicKey,
  randomUuid,
  sha256Hex,
  verifyPayload,
  type AgentModule,
  type AgentSyncResponse,
  type Policy,
  NER_BROWSER_HASH_KEY,
  NER_BROWSER_MODEL,
  onnxFile,
} from "@acg/shared";
import { query } from "../db.js";
import { Public, Roles } from "../auth/guards.js";
import type { AuthUser } from "../auth/jwt.js";
import { env } from "../env.js";
import { clientIp } from "../client-ip.js";

@Controller("/v1/agents")
export class AgentsController {
  @Roles("RSSI", "ADMIN")
  @Get()
  async list() {
    const res = await query(
      `SELECT a.*, u.email, u.display_name, u.department
         FROM agent a
         LEFT JOIN app_user u ON u.id = a.user_id
        WHERE a.revoked_at IS NULL
        ORDER BY a.last_heartbeat_at DESC NULLS LAST`,
    );
    return res.rows;
  }

  @Roles("RSSI", "ADMIN")
  @Get("/assignees")
  async assignees() {
    const res = await query<{ id: string; email: string; display_name: string; department: string; role: string }>(
      `SELECT id, email, display_name, department, role FROM app_user WHERE is_active = true ORDER BY display_name`,
    );
    return res.rows.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.display_name,
      department: u.department,
      role: u.role,
    }));
  }

  @Roles("RSSI", "ADMIN")
  @Get("/enrollment-tokens")
  async listTokens() {
    const res = await query<{
      token_hash: string;
      modules: string[];
      user_id: string | null;
      email: string | null;
      display_name: string | null;
      created_at: Date;
      expires_at: Date;
      used_at: Date | null;
      revoked_at: Date | null;
      redeemed: string[] | null;
    }>(
      `SELECT t.token_hash, t.modules, t.user_id, u.email, u.display_name,
              t.created_at, t.expires_at, t.used_at, t.revoked_at,
              coalesce(
                (SELECT array_agg(r.module ORDER BY r.module)
                   FROM enrollment_token_redemption r
                  WHERE r.token_hash = t.token_hash),
                ARRAY[]::text[]
              ) AS redeemed
         FROM enrollment_token t
         LEFT JOIN app_user u ON u.id = t.user_id
        ORDER BY t.created_at DESC
        LIMIT 100`,
    );
    const now = Date.now();
    return res.rows
      .map((row) => {
        const status = tokenStatus(row, now);
        return {
          id: row.token_hash,
          tokenPreview: `${row.token_hash.slice(0, 8)}…${row.token_hash.slice(-6)}`,
          modules: row.modules,
          redeemedModules: row.redeemed ?? [],
          userId: row.user_id,
          assignedTo: row.email,
          assignedName: row.display_name,
          createdAt: row.created_at.toISOString(),
          expiresAt: row.expires_at.toISOString(),
          usedAt: row.used_at?.toISOString() ?? null,
          revokedAt: row.revoked_at?.toISOString() ?? null,
          status,
          canRevoke: status === "active" || status === "partial",
        };
      })
      .sort((a, b) => Number(b.canRevoke) - Number(a.canRevoke) || b.createdAt.localeCompare(a.createdAt));
  }

  @Roles("RSSI", "ADMIN")
  @Post("/enrollment-tokens")
  async createToken(@Body() body: unknown, @Req() req: { user: AuthUser }) {
    const parsed = CreateEnrollmentTokenSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(" · "));
    }
    const input = parsed.data;
    const modules = uniqueModules(input.modules);
    const token = randomUuid().replace(/-/g, "") + randomUuid().replace(/-/g, "");
    const tokenHash = await sha256Hex(token);
    const ttl = input.ttlMinutes ?? 60;
    let userId = input.userId ?? null;
    if (!userId) {
      const fallback = await query<{ id: string }>(
        `SELECT id FROM app_user WHERE role = 'USER' AND is_active = true ORDER BY email LIMIT 1`,
      );
      userId = fallback.rows[0]?.id ?? req.user.id;
    }
    const assignee = await query<{ email: string; display_name: string; is_active: boolean }>(
      `SELECT email, display_name, is_active FROM app_user WHERE id = $1`,
      [userId],
    );
    if (!assignee.rows[0] || !assignee.rows[0].is_active) {
      throw new BadRequestException("Collaborateur introuvable ou inactif");
    }
    await query(
      `INSERT INTO enrollment_token(token_hash, modules, user_id, created_by, expires_at)
       VALUES ($1,$2,$3,$4, now() + ($5 || ' minutes')::interval)`,
      [tokenHash, modules, userId, req.user.id, ttl],
    );
    const apiUrl = env.apiPublicUrl;
    const coversA1 = modules.includes("A1");
    const coversA2 = modules.includes("A2");
    const command = coversA2 ? `node apps/agent-cli/dist/cli.js enroll --api ${apiUrl} --token ${token}` : null;
    const parts: string[] = [];
    if (coversA1) {
      parts.push(
        `Extension (A1) : charger apps/agent-browser/dist dans chrome://extensions, coller ${apiUrl} et ce jeton, puis Enrôler.`,
      );
    }
    if (coversA2) {
      parts.push(`Terminal (A2) : ${command} — installe les wrappers et lance le démon heartbeat.`);
    }
    parts.push("Le même jeton sert pour les deux endpoints tant qu'ils n'ont pas chacun été enrôlés.");
    return {
      id: tokenHash,
      token,
      modules,
      /** @deprecated conserver pour compat UI ; préférer `modules`. */
      module: modules.length === 1 ? modules[0] : "BOTH",
      userId,
      assignedTo: assignee.rows[0].email,
      assignedName: assignee.rows[0].display_name,
      expiresAt: new Date(Date.now() + ttl * 60_000).toISOString(),
      apiUrl,
      command,
      instructions: parts.join(" "),
    };
  }

  @Roles("RSSI", "ADMIN")
  @Delete("/enrollment-tokens/:id")
  async revokeToken(@Param("id") id: string, @Req() req: { user: AuthUser }) {
    const tokenHash = id.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(tokenHash)) {
      throw new BadRequestException("Identifiant de jeton invalide");
    }
    const current = await query<{
      token_hash: string;
      revoked_at: Date | null;
      used_at: Date | null;
      expires_at: Date;
      user_id: string | null;
      modules: string[];
    }>(`SELECT token_hash, revoked_at, used_at, expires_at, user_id, modules FROM enrollment_token WHERE token_hash = $1`, [tokenHash]);
    const row = current.rows[0];
    if (!row) throw new NotFoundException("Jeton introuvable");
    if (row.revoked_at) return { ok: true, id: tokenHash, alreadyRevoked: true };

    await query(`UPDATE enrollment_token SET revoked_at = now(), revoked_by = $2 WHERE token_hash = $1`, [tokenHash, req.user.id]);
    await query(
      `INSERT INTO admin_audit_log(actor_id, action, entity_type, entity_id, before, after)
       VALUES ($1,'REVOKE','enrollment_token',$2,$3,$4)`,
      [
        req.user.id,
        tokenHash,
        JSON.stringify({ usedAt: row.used_at, expiresAt: row.expires_at, userId: row.user_id, modules: row.modules }),
        JSON.stringify({ revokedAt: new Date().toISOString() }),
      ],
    );
    return { ok: true, id: tokenHash };
  }

  @Public()
  @Post("/enroll")
  async enroll(@Body() body: unknown, @Req() req: { ip?: string; headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }) {
    const input = EnrollAgentRequestSchema.parse(body);
    const tokenHash = await sha256Hex(input.enrollmentToken);
    const tok = await query<{
      token_hash: string;
      modules: string[];
      user_id: string | null;
      expires_at: Date;
      used_at: Date | null;
      revoked_at: Date | null;
    }>(
      `SELECT token_hash, modules, user_id, expires_at, used_at, revoked_at
         FROM enrollment_token WHERE token_hash = $1`,
      [tokenHash],
    );
    const row = tok.rows[0];
    if (!row || row.expires_at.getTime() < Date.now()) {
      throw new UnauthorizedException("Jeton d'enrôlement invalide ou expiré");
    }
    if (row.revoked_at) {
      throw new UnauthorizedException("Jeton d'enrôlement révoqué");
    }
    if (row.used_at) {
      throw new UnauthorizedException("Jeton d'enrôlement déjà entièrement consommé");
    }
    if (!row.modules.includes(input.module)) {
      throw new BadRequestException(`Ce jeton ne couvre pas le module ${input.module}`);
    }
    const already = await query(
      `SELECT module FROM enrollment_token_redemption WHERE token_hash = $1 AND module = $2`,
      [tokenHash, input.module],
    );
    if (already.rows[0]) {
      throw new UnauthorizedException(`Le module ${input.module} a déjà été enrôlé avec ce jeton`);
    }

    const agentId = randomUuid();
    const lastIp = clientIp(req);
    await query(
      `INSERT INTO agent(agent_id, module, user_id, hostname, agent_version, public_key, last_heartbeat_at, integrity_status, last_ip)
       VALUES ($1,$2,$3,$4,$5,$6, now(), 'ok', $7)`,
      [agentId, input.module, row.user_id, input.hostname, input.agentVersion, JSON.stringify(input.publicKey), lastIp],
    );
    await query(
      `INSERT INTO enrollment_token_redemption(token_hash, module, agent_id) VALUES ($1,$2,$3)`,
      [tokenHash, input.module, agentId],
    );
    const redeemed = await query<{ module: string }>(
      `SELECT module FROM enrollment_token_redemption WHERE token_hash = $1`,
      [tokenHash],
    );
    const allRedeemed = row.modules.every((m) => redeemed.rows.some((r) => r.module === m));
    if (allRedeemed) {
      await query(`UPDATE enrollment_token SET used_at = now(), agent_id = $2 WHERE token_hash = $1`, [tokenHash, agentId]);
    } else {
      await query(`UPDATE enrollment_token SET agent_id = $2 WHERE token_hash = $1`, [tokenHash, agentId]);
    }
    return {
      agentId,
      userId: row.user_id,
      heartbeatIntervalSeconds: 60,
      syncIntervalSeconds: 300,
    };
  }

  @Public()
  @Post("/heartbeat")
  async heartbeat(
    @Body() body: unknown,
    @Req() req: { ip?: string; headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } },
  ) {
    const envelope = SignedHeartbeatSchema.parse(body);
    const payload = HeartbeatPayloadSchema.parse(envelope.payload);
    const agent = await query<{ public_key: string; last_sequence: string; integrity_status: string; revoked_at: Date | null }>(
      `SELECT public_key, last_sequence::text, integrity_status, revoked_at FROM agent WHERE agent_id = $1`,
      [payload.agentId],
    );
    const row = agent.rows[0];
    if (!row || row.revoked_at) throw new UnauthorizedException("Agent inconnu");
    const key = await importPublicKey(JSON.parse(row.public_key));
    if (!(await verifyPayload(key, payload, envelope.signature))) throw new UnauthorizedException("Heartbeat non authentifié");
    if (payload.sequence <= Number(row.last_sequence)) throw new UnauthorizedException("Séquence heartbeat rejouée");

    let integrityStatus = "ok";
    const mismatch = payload.integrity.models.some((m) => m.status === "mismatch");
    if (mismatch) integrityStatus = "tampered";
    else if (!payload.integrity.localDetectionAvailable) integrityStatus = "degraded";

    const wasMissing = row.integrity_status === "missing";
    const lastIp = clientIp(req);
    await query(
      `UPDATE agent SET last_heartbeat_at = now(), last_sequence = $2, integrity_status = $3,
              last_integrity_report = $4, agent_version = $5, last_ip = COALESCE($6, last_ip)
        WHERE agent_id = $1`,
      [payload.agentId, payload.sequence, integrityStatus, JSON.stringify(payload.integrity), payload.agentVersion, lastIp],
    );

    if (integrityStatus === "tampered") {
      await query(
        `INSERT INTO security_alert(alert_type, severity, agent_id, message, details)
         VALUES ('AGENT_TAMPERED','critical',$1,'Intégrité de l''agent compromise', $2)`,
        [payload.agentId, JSON.stringify(payload.integrity)],
      );
    }
    if (wasMissing && integrityStatus === "ok") {
      await query(
        `INSERT INTO security_alert(alert_type, severity, agent_id, message)
         VALUES ('AGENT_RECOVERED','info',$1,'Signal de présence rétabli')`,
        [payload.agentId],
      );
    }

    const currentVersion = await policyVersion();
    return {
      acknowledged: true,
      serverTime: new Date().toISOString(),
      syncRequired: payload.policyVersion !== currentVersion,
      integrityStatus,
    };
  }

  @Public()
  @Get("/sync")
  async sync(@Req() req: { headers: Record<string, string | undefined> }): Promise<AgentSyncResponse> {
    const agentId = req.headers["x-agent-id"];
    if (!agentId) throw new UnauthorizedException("X-Agent-Id requis");
    const ts = req.headers["x-agent-timestamp"];
    const sig = req.headers["x-agent-signature"];
    const agent = await query<{ public_key: string; user_id: string | null; revoked_at: Date | null }>(
      `SELECT public_key, user_id, revoked_at FROM agent WHERE agent_id = $1`,
      [agentId],
    );
    const row = agent.rows[0];
    if (!row || row.revoked_at) throw new UnauthorizedException("Agent inconnu");
    if (ts && sig) {
      const key = await importPublicKey(JSON.parse(row.public_key));
      const ok = await verifyPayload(key, { agentId, method: "GET", path: "/v1/agents/sync", ts }, sig);
      if (!ok) throw new UnauthorizedException("Signature sync invalide");
    }

    const userRow = row.user_id
      ? await query<{
          id: string;
          department: string;
          jurisdiction: string;
          role: string;
          risk_history_level: "low" | "moderate" | "high";
        }>(
          `SELECT u.id, u.department, u.jurisdiction, u.role, d.risk_history_level
             FROM app_user u JOIN reference.department d ON d.name = u.department WHERE u.id = $1`,
          [row.user_id],
        )
      : await query<{
          id: string;
          department: string;
          jurisdiction: string;
          role: string;
          risk_history_level: "low" | "moderate" | "high";
        }>(
          `SELECT u.id, u.department, u.jurisdiction, u.role, d.risk_history_level
             FROM app_user u JOIN reference.department d ON d.name = u.department WHERE u.role = 'USER' LIMIT 1`,
        );
    const user = userRow.rows[0];
    if (!user) throw new BadRequestException("Aucun utilisateur associé à l'agent");

    const policies = await query(`SELECT * FROM policy WHERE enabled = true ORDER BY priority`);
    const services = await query(`SELECT * FROM reference.ai_service WHERE enabled = true`);
    const weights = await query<{ factor_name: string; weight: string }>(`SELECT factor_name, weight FROM risk_factor_weight`);
    const bands = await query<{ band: "low" | "moderate" | "high" | "critical"; min_score: number; max_score: number }>(
      `SELECT band, min_score, max_score FROM risk_band_threshold`,
    );
    const fw = await query<{ id: string }>(`SELECT id FROM reference.regulatory_framework WHERE is_active LIMIT 1`);
    const version = await policyVersion();

    const riskWeights = Object.fromEntries(weights.rows.map((w) => [w.factor_name, Number(w.weight)])) as AgentSyncResponse["riskWeights"];
    const riskBandThresholds = {
      low: [0, 24] as [number, number],
      moderate: [25, 49] as [number, number],
      high: [50, 74] as [number, number],
      critical: [75, 100] as [number, number],
    };
    for (const b of bands.rows) riskBandThresholds[b.band] = [b.min_score, b.max_score];

    const mappedPolicies: Policy[] = policies.rows.map((p) => ({
      id: String(p.id),
      name: String(p.name),
      description: (p.description as string | null) ?? null,
      conditionExpr: String(p.condition_expr),
      action: p.action as Policy["action"],
      priority: Number(p.priority),
      version: Number(p.version),
      enabled: Boolean(p.enabled),
      referenceFrameworks: (p.reference_frameworks as string[]) ?? [],
    }));

    return {
      policyVersion: version,
      generatedAt: new Date().toISOString(),
      policies: mappedPolicies,
      aiServices: services.rows.map((s) => ({
        id: String(s.id),
        name: String(s.name),
        hostingRegion: String(s.hosting_region),
        riskBaseline: Number(s.risk_baseline),
        freeAccess: Boolean(s.free_access),
        domains: (s.domains as string[]) ?? [],
        cliCommands: (s.cli_commands as string[]) ?? [],
      })),
      riskWeights,
      riskBandThresholds,
      organization: {
        jurisdiction: env.organizationJurisdiction,
        regulatoryFrameworkId: fw.rows[0]?.id ?? env.regulatoryFramework,
      },
      user: {
        userId: user.id,
        department: user.department,
        departmentRiskLevel: user.risk_history_level,
        jurisdiction: user.jurisdiction,
        role: user.role,
      },
      heartbeatIntervalSeconds: 60,
      syncIntervalSeconds: 300,
      expectedModelHashes: {
        ...(env.nerModelSha256 ? { ner: env.nerModelSha256 } : {}),
        ...(env.llmModelSha256 ? { llm: env.llmModelSha256 } : {}),
        [NER_BROWSER_HASH_KEY]: onnxFile(NER_BROWSER_MODEL).sha256,
      },
    };
  }

  @Roles("RSSI", "ADMIN")
  @Get("/alerts")
  async alerts() {
    const res = await query(`SELECT * FROM security_alert ORDER BY created_at DESC LIMIT 100`);
    return res.rows;
  }

  @Roles("RSSI", "ADMIN")
  @Post("/alerts/:id/ack")
  async ack(@Param("id") id: string, @Req() req: { user: AuthUser }) {
    await query(`UPDATE security_alert SET acknowledged_at = now(), acknowledged_by = $2 WHERE id = $1`, [id, req.user.id]);
    return { ok: true };
  }
}

async function policyVersion(): Promise<string> {
  const res = await query<{ v: string }>(
    `SELECT concat(
       (SELECT count(*)::text FROM policy),
       ':',
       greatest(
         coalesce((SELECT max(updated_at) FROM policy), to_timestamp(0)),
         coalesce((SELECT max(updated_at) FROM reference.ai_service), to_timestamp(0))
       )::text
     ) AS v`,
  );
  return res.rows[0]?.v ?? "none";
}

function uniqueModules(modules: AgentModule[]): AgentModule[] {
  return (["A1", "A2"] as const).filter((m) => modules.includes(m));
}

function tokenStatus(
  row: { revoked_at: Date | null; used_at: Date | null; expires_at: Date; modules: string[]; redeemed: string[] | null },
  now: number,
): "active" | "partial" | "used" | "expired" | "revoked" {
  if (row.revoked_at) return "revoked";
  if (row.used_at) return "used";
  if (row.expires_at.getTime() < now) return "expired";
  const redeemed = row.redeemed ?? [];
  if (redeemed.length > 0 && redeemed.length < row.modules.length) return "partial";
  return "active";
}

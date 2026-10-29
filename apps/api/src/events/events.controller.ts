import { Controller, Get, Query } from "@nestjs/common";
import { query } from "../db.js";
import { computeEventHash, type SecurityEvent, type SecurityEventHashInput } from "@acg/shared";

@Controller("/v1/events")
export class EventsController {
  @Get()
  async list(
    @Query("limit") limit = "50",
    @Query("offset") offset = "0",
    @Query("action") action?: string,
    @Query("department") department?: string,
  ) {
    const params: unknown[] = [];
    const where: string[] = [];
    if (action) {
      params.push(action);
      where.push(`e.action = $${params.length}`);
    }
    if (department) {
      params.push(department);
      where.push(`e.department = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    params.push(Number(limit), Number(offset));
    const res = await query(
      `SELECT e.*, COALESCE(e.client_ip, a.last_ip) AS client_ip,
              EXISTS (SELECT 1 FROM vault.escrow s WHERE s.event_id = e.event_id) AS has_escrow
         FROM analytics.security_event e
         LEFT JOIN agent a ON a.agent_id = e.agent_id
         ${whereSql}
         ORDER BY e.occurred_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const totalWhere = whereSql.replaceAll(/\be\./g, "");
    const total = await query<{ count: string }>(
      `SELECT count(*)::text AS count FROM analytics.security_event ${totalWhere}`,
      params.slice(0, -2),
    );
    return { items: res.rows.map(mapEvent), total: Number(total.rows[0]?.count ?? 0) };
  }

  @Get("/chain/verify")
  async verifyChain() {
    const res = await query(`SELECT * FROM analytics.security_event ORDER BY sequence ASC`);
    let prev: string | null = null;
    let checked = 0;
    let firstBroken: number | null = null;
    for (const row of res.rows) {
      const mapped = mapEvent(row);
      const expected = await computeEventHash(hashInputFromEvent(mapped, prev));
      checked++;
      if (expected !== mapped.eventHash || mapped.prevEventHash !== prev) {
        firstBroken = Number(row.sequence);
        break;
      }
      prev = mapped.eventHash;
    }
    return { verified: firstBroken === null, checkedEvents: checked, firstBrokenSequence: firstBroken };
  }
}

export function mapEvent(row: Record<string, unknown>): SecurityEvent {
  const clientIp = row.client_ip == null || row.client_ip === "" ? null : String(row.client_ip);
  return {
    eventId: String(row.event_id),
    sequence: Number(row.sequence),
    occurredAt: new Date(row.occurred_at as string).toISOString(),
    userIdHash: String(row.user_id_hash).trim(),
    department: String(row.department),
    agentId: (row.agent_id as string | null) ?? null,
    channel: row.channel as SecurityEvent["channel"],
    clientIp,
    aiServiceId: (row.ai_service_id as string | null) ?? null,
    hostingRegion: (row.hosting_region as string | null) ?? null,
    entitiesDetected: (row.entities_detected as string[]) ?? [],
    entityCounts: (row.entity_counts as Record<string, number>) ?? {},
    contextCategory: (row.context_category as string | null) ?? null,
    riskScore: Number(row.risk_score),
    riskBand: row.risk_band as SecurityEvent["riskBand"],
    factorBreakdown: (row.factor_breakdown as SecurityEvent["factorBreakdown"]) ?? [],
    policyId: (row.policy_id as string | null) ?? null,
    action: row.action as SecurityEvent["action"],
    serverDecision: (row.server_decision as SecurityEvent["serverDecision"] | null) ?? undefined,
    referenceFrameworks: (row.reference_frameworks as string[]) ?? [],
    degradedMode: Boolean(row.degraded_mode),
    processingTimeMs: row.processing_time_ms === null ? null : Number(row.processing_time_ms),
    detectionLayers: (row.detection_layers as string[]) ?? [],
    prevEventHash: row.prev_event_hash ? String(row.prev_event_hash).trim() : null,
    eventHash: String(row.event_hash).trim(),
    hasEscrow: row.has_escrow === undefined ? undefined : Boolean(row.has_escrow),
  };
}

export function hashInputFromEvent(event: SecurityEvent, prevEventHash: string | null): SecurityEventHashInput {
  const { sequence: _sequence, eventHash: _eventHash, clientIp: _clientIp, hasEscrow: _hasEscrow, ...rest } = event;
  return { ...rest, prevEventHash };
}

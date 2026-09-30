import { Controller, Get, Query } from "@nestjs/common";
import { query } from "../db.js";
import { computeEventHash } from "@acg/shared";
import { env } from "../env.js";
import { mapEvent, hashInputFromEvent } from "../events/events.controller.js";
import { Roles } from "../auth/guards.js";

@Controller("/v1/analytics")
@Roles("RSSI", "DPO", "ADMIN")
export class AnalyticsController {
  @Get("/summary")
  async summary(@Query("from") from?: string, @Query("to") to?: string) {
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 7 * 24 * 3600_000);
    const spanMs = toDate.getTime() - fromDate.getTime();
    const trunc = spanMs > 48 * 3600_000 ? "day" : "hour";

    const totals = await query<{
      interactions: string;
      allow: string;
      warn: string;
      mask: string;
      block: string;
      degraded: string;
      avg_risk: string;
      p95: string | null;
    }>(
      `SELECT
         count(*)::text AS interactions,
         count(*) FILTER (WHERE action = 'ALLOW')::text AS allow,
         count(*) FILTER (WHERE action = 'WARN')::text AS warn,
         count(*) FILTER (WHERE action = 'MASK')::text AS mask,
         count(*) FILTER (WHERE action = 'BLOCK')::text AS block,
         count(*) FILTER (WHERE degraded_mode)::text AS degraded,
         coalesce(avg(risk_score),0)::text AS avg_risk,
         percentile_cont(0.95) WITHIN GROUP (ORDER BY processing_time_ms)::text AS p95
       FROM analytics.security_event
       WHERE occurred_at BETWEEN $1 AND $2`,
      [fromDate.toISOString(), toDate.toISOString()],
    );
    const t = totals.rows[0]!;

    const byBand = await query<{ risk_band: string; n: string }>(
      `SELECT risk_band, count(*)::text AS n FROM analytics.security_event WHERE occurred_at BETWEEN $1 AND $2 GROUP BY risk_band`,
      [fromDate.toISOString(), toDate.toISOString()],
    );
    const byDepartment = await query<{ department: string; count: string; blocked: string; avg_risk: string }>(
      `SELECT department, count(*)::text AS count,
              count(*) FILTER (WHERE action = 'BLOCK')::text AS blocked,
              coalesce(avg(risk_score),0)::text AS avg_risk
         FROM analytics.security_event WHERE occurred_at BETWEEN $1 AND $2
         GROUP BY department ORDER BY count DESC`,
      [fromDate.toISOString(), toDate.toISOString()],
    );
    const byService = await query<{ ai_service_id: string; hosting_region: string | null; count: string }>(
      `SELECT ai_service_id, hosting_region, count(*)::text AS count
         FROM analytics.security_event WHERE occurred_at BETWEEN $1 AND $2 AND ai_service_id IS NOT NULL
         GROUP BY ai_service_id, hosting_region ORDER BY count DESC LIMIT 12`,
      [fromDate.toISOString(), toDate.toISOString()],
    );
    const topEntities = await query<{ entity: string; count: string }>(
      `SELECT unnest(entities_detected) AS entity, count(*)::text AS count
         FROM analytics.security_event WHERE occurred_at BETWEEN $1 AND $2
         GROUP BY entity ORDER BY count DESC LIMIT 10`,
      [fromDate.toISOString(), toDate.toISOString()],
    );
    const timeline = await query<{ bucket: Date; allow: string; warn: string; mask: string; block: string }>(
      `SELECT date_trunc($3, occurred_at) AS bucket,
              count(*) FILTER (WHERE action = 'ALLOW')::text AS allow,
              count(*) FILTER (WHERE action = 'WARN')::text AS warn,
              count(*) FILTER (WHERE action = 'MASK')::text AS mask,
              count(*) FILTER (WHERE action = 'BLOCK')::text AS block
         FROM analytics.security_event WHERE occurred_at BETWEEN $1 AND $2
         GROUP BY 1 ORDER BY 1`,
      [fromDate.toISOString(), toDate.toISOString(), trunc],
    );
    const agents = await query<{ total: string; online: string; missing: string; tampered: string }>(
      `SELECT count(*)::text AS total,
              count(*) FILTER (WHERE integrity_status = 'ok' AND last_heartbeat_at > now() - ($1 || ' seconds')::interval)::text AS online,
              count(*) FILTER (WHERE integrity_status = 'missing')::text AS missing,
              count(*) FILTER (WHERE integrity_status = 'tampered')::text AS tampered
         FROM agent WHERE revoked_at IS NULL`,
      [env.heartbeatTimeoutSeconds],
    );
    const alerts = await query<{ n: string }>(`SELECT count(*)::text AS n FROM security_alert WHERE acknowledged_at IS NULL`);
    const chain = await this.verifyRecentChain();
    const fw = await query<{ id: string }>(`SELECT id FROM reference.regulatory_framework WHERE is_active LIMIT 1`);

    const orgJ = env.organizationJurisdiction;
    return {
      period: { from: fromDate.toISOString(), to: toDate.toISOString() },
      totals: {
        interactions: Number(t.interactions),
        allow: Number(t.allow),
        warn: Number(t.warn),
        mask: Number(t.mask),
        block: Number(t.block),
        degraded: Number(t.degraded),
        averageRiskScore: Math.round(Number(t.avg_risk) * 10) / 10,
        p95ProcessingTimeMs: t.p95 ? Math.round(Number(t.p95)) : null,
      },
      byBand: Object.fromEntries(byBand.rows.map((r) => [r.risk_band, Number(r.n)])),
      byDepartment: byDepartment.rows.map((r) => ({
        department: r.department,
        count: Number(r.count),
        blocked: Number(r.blocked),
        avgRisk: Math.round(Number(r.avg_risk) * 10) / 10,
      })),
      byService: byService.rows.map((r) => ({
        aiServiceId: r.ai_service_id,
        hostingRegion: r.hosting_region,
        count: Number(r.count),
        crossBorder: (r.hosting_region ?? "").toUpperCase() !== orgJ.toUpperCase(),
      })),
      topEntities: topEntities.rows.map((r) => ({ entityType: r.entity, count: Number(r.count) })),
      timeline: timeline.rows.map((r) => ({
        bucket: new Date(r.bucket).toISOString(),
        allow: Number(r.allow),
        warn: Number(r.warn),
        mask: Number(r.mask),
        block: Number(r.block),
      })),
      agents: {
        total: Number(agents.rows[0]?.total ?? 0),
        online: Number(agents.rows[0]?.online ?? 0),
        missing: Number(agents.rows[0]?.missing ?? 0),
        tampered: Number(agents.rows[0]?.tampered ?? 0),
      },
      openAlerts: Number(alerts.rows[0]?.n ?? 0),
      chainIntegrity: chain,
      activeFramework: fw.rows[0]?.id ?? null,
    };
  }

  private async verifyRecentChain() {
    const res = await query(`SELECT * FROM analytics.security_event ORDER BY sequence DESC LIMIT 80`);
    const rows = res.rows.reverse();
    let prev: string | null = rows[0] ? mapEvent(rows[0]!).prevEventHash : null;
    let checked = 0;
    let firstBroken: number | null = null;
    for (const row of rows) {
      const mapped = mapEvent(row);
      const expected = await computeEventHash(hashInputFromEvent(mapped, prev));
      checked++;
      if (expected !== mapped.eventHash) {
        firstBroken = mapped.sequence ?? null;
        break;
      }
      prev = mapped.eventHash;
    }
    return { verified: firstBroken === null, checkedEvents: checked, firstBrokenSequence: firstBroken };
  }
}

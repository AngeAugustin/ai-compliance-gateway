import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { query } from "./db.js";
import { env } from "./env.js";

@Injectable()
export class HeartbeatMonitor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HeartbeatMonitor.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, env.heartbeatCheckIntervalSeconds * 1000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    try {
      const missing = await query<{ agent_id: string }>(
        `UPDATE agent SET integrity_status = 'missing'
          WHERE revoked_at IS NULL
            AND integrity_status <> 'missing'
            AND (last_heartbeat_at IS NULL OR last_heartbeat_at < now() - ($1 || ' seconds')::interval)
          RETURNING agent_id`,
        [env.heartbeatTimeoutSeconds],
      );
      for (const row of missing.rows) {
        await query(
          `INSERT INTO security_alert(alert_type, severity, agent_id, message)
           VALUES ('AGENT_MISSING','critical',$1,'Agent potentiellement désactivé (aucun signal de présence)')`,
          [row.agent_id],
        );
        this.logger.warn(`Agent ${row.agent_id} manquant (NFR-03)`);
      }
    } catch (err) {
      this.logger.warn(`Contrôle heartbeat ignoré (Postgres injoignable) : ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

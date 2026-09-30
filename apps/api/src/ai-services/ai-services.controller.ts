import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Post, Put, Req } from "@nestjs/common";
import { query } from "../db.js";
import { Roles } from "../auth/guards.js";
import type { AuthUser } from "../auth/jwt.js";

type ServiceBody = {
  id?: string;
  name?: string;
  hostingRegion?: string;
  riskBaseline?: number;
  freeAccess?: boolean;
  domains?: string[] | string;
  cliCommands?: string[] | string;
  enabled?: boolean;
};

@Controller("/v1/ai-services")
export class AiServicesController {
  @Get()
  async list() {
    const res = await query(`SELECT * FROM reference.ai_service ORDER BY name`);
    return res.rows.map(mapService);
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    const res = await query(`SELECT * FROM reference.ai_service WHERE id = $1`, [decodeId(id)]);
    if (!res.rows[0]) throw new NotFoundException("Service d'IA introuvable");
    return mapService(res.rows[0]);
  }

  @Roles("RSSI", "ADMIN")
  @Post()
  async create(@Body() body: ServiceBody, @Req() req: { user: AuthUser }) {
    const input = parseBody(body, true);
    const exists = await query(`SELECT id FROM reference.ai_service WHERE id = $1`, [input.id]);
    if (exists.rows[0]) throw new ConflictException("Un service avec cet identifiant existe déjà");
    const res = await query(
      `INSERT INTO reference.ai_service(id, name, hosting_region, risk_baseline, free_access, domains, cli_commands, enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [input.id, input.name, input.hostingRegion, input.riskBaseline, input.freeAccess, input.domains, input.cliCommands, input.enabled],
    );
    await audit(req.user.id, "CREATE", input.id, null, res.rows[0]);
    return mapService(res.rows[0]!);
  }

  @Roles("RSSI", "ADMIN")
  @Put(":id")
  async update(@Param("id") rawId: string, @Body() body: ServiceBody, @Req() req: { user: AuthUser }) {
    const id = decodeId(rawId);
    const current = await query(`SELECT * FROM reference.ai_service WHERE id = $1`, [id]);
    if (!current.rows[0]) throw new NotFoundException("Service d'IA introuvable");
    const input = parseBody({ ...body, id }, false);
    const res = await query(
      `UPDATE reference.ai_service SET
         name = $2,
         hosting_region = $3,
         risk_baseline = $4,
         free_access = $5,
         domains = $6,
         cli_commands = $7,
         enabled = $8,
         updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [id, input.name, input.hostingRegion, input.riskBaseline, input.freeAccess, input.domains, input.cliCommands, input.enabled],
    );
    await audit(req.user.id, "UPDATE", id, current.rows[0], res.rows[0]);
    return mapService(res.rows[0]!);
  }

  @Roles("RSSI", "ADMIN")
  @Delete(":id")
  async remove(@Param("id") rawId: string, @Req() req: { user: AuthUser }) {
    const id = decodeId(rawId);
    const current = await query(`SELECT * FROM reference.ai_service WHERE id = $1`, [id]);
    if (!current.rows[0]) throw new NotFoundException("Service d'IA introuvable");
    await query(`DELETE FROM reference.ai_service WHERE id = $1`, [id]);
    await audit(req.user.id, "DELETE", id, current.rows[0], null);
    return { ok: true, id };
  }
}

function decodeId(id: string): string {
  try {
    return decodeURIComponent(id).trim();
  } catch {
    return id.trim();
  }
}

function asList(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) return value.map((s) => s.trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function parseBody(body: ServiceBody, creating: boolean) {
  const id = (body.id ?? "").trim().toLowerCase();
  const name = (body.name ?? "").trim();
  const hostingRegion = (body.hostingRegion ?? "").trim().toUpperCase();
  const riskBaseline = Number(body.riskBaseline ?? 30);
  if (creating && !/^[a-z0-9][a-z0-9._-]{1,80}$/.test(id)) {
    throw new BadRequestException("Identifiant invalide — utilisez un domaine ou un slug (ex. poe.com)");
  }
  if (!name) throw new BadRequestException("Le nom est requis");
  if (!/^[A-Z]{2,3}$/.test(hostingRegion)) {
    throw new BadRequestException("Région d'hébergement : code pays ISO (US, EU, CN, BJ…)");
  }
  if (!Number.isFinite(riskBaseline) || riskBaseline < 0 || riskBaseline > 100) {
    throw new BadRequestException("Risque de base entre 0 et 100");
  }
  return {
    id,
    name,
    hostingRegion,
    riskBaseline: Math.round(riskBaseline),
    freeAccess: body.freeAccess !== false,
    domains: asList(body.domains),
    cliCommands: asList(body.cliCommands),
    enabled: body.enabled !== false,
  };
}

function mapService(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: String(row.name),
    hostingRegion: String(row.hosting_region),
    riskBaseline: Number(row.risk_baseline),
    freeAccess: Boolean(row.free_access),
    domains: (row.domains as string[]) ?? [],
    cliCommands: (row.cli_commands as string[]) ?? [],
    enabled: Boolean(row.enabled),
    updatedAt: row.updated_at ? new Date(row.updated_at as string).toISOString() : null,
  };
}

async function audit(actorId: string, action: string, entityId: string, before: unknown, after: unknown) {
  await query(`INSERT INTO admin_audit_log(actor_id, action, entity_type, entity_id, before, after) VALUES ($1,$2,'ai_service',$3,$4,$5)`, [
    actorId,
    action,
    entityId,
    before ? JSON.stringify(before) : null,
    after ? JSON.stringify(after) : null,
  ]);
}

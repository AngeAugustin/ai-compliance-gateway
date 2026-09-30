import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Req } from "@nestjs/common";
import { CreatePolicySchema, UpdatePolicySchema, lintCondition, parseCondition, explainCondition, type Policy } from "@acg/shared";
import { query } from "../db.js";
import { Roles } from "../auth/guards.js";
import type { AuthUser } from "../auth/jwt.js";

@Controller("/v1/policies")
export class PoliciesController {
  @Get()
  async list() {
    const res = await query<Record<string, unknown>>(`SELECT * FROM policy ORDER BY priority ASC, name ASC`);
    return res.rows.map(mapPolicy);
  }

  @Post("/preview")
  preview(@Body() body: { conditionExpr: string }) {
    const errors = lintCondition(body.conditionExpr);
    if (errors.length) return { valid: false, errors, explanation: null };
    return { valid: true, errors: [], explanation: explainCondition(parseCondition(body.conditionExpr)) };
  }

  @Roles("RSSI", "ADMIN")
  @Post()
  async create(@Body() body: unknown, @Req() req: { user: AuthUser }) {
    const input = parseOrThrow(CreatePolicySchema, body);
    const errors = lintCondition(input.conditionExpr);
    if (errors.length) throw new BadRequestException(errors.join(" · "));
    const res = await query(
      `INSERT INTO policy(name, description, condition_expr, action, priority, enabled, reference_frameworks, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        input.name,
        input.description ?? null,
        input.conditionExpr,
        input.action,
        input.priority ?? 100,
        input.enabled ?? true,
        input.referenceFrameworks ?? [],
        req.user.id,
      ],
    );
    const row = res.rows[0]!;
    await this.snapshot(row, req.user.id);
    await this.audit(req.user.id, "CREATE", row.id, null, row);
    return mapPolicy(row);
  }

  @Roles("RSSI", "ADMIN")
  @Put(":id")
  async update(@Param("id") id: string, @Body() body: unknown, @Req() req: { user: AuthUser }) {
    const input = parseOrThrow(UpdatePolicySchema, body);
    const current = await query(`SELECT * FROM policy WHERE id = $1`, [id]);
    if (!current.rows[0]) throw new NotFoundException("Politique introuvable");
    if (input.conditionExpr) {
      const errors = lintCondition(input.conditionExpr);
      if (errors.length) throw new BadRequestException(errors.join(" · "));
    }
    const nextVersion = Number(current.rows[0].version) + 1;
    const res = await query(
      `UPDATE policy SET
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         condition_expr = COALESCE($4, condition_expr),
         action = COALESCE($5, action),
         priority = COALESCE($6, priority),
         enabled = COALESCE($7, enabled),
         reference_frameworks = COALESCE($8, reference_frameworks),
         version = $9,
         updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        input.name ?? null,
        input.description ?? null,
        input.conditionExpr ?? null,
        input.action ?? null,
        input.priority ?? null,
        input.enabled ?? null,
        input.referenceFrameworks ?? null,
        nextVersion,
      ],
    );
    await this.snapshot(res.rows[0]!, req.user.id);
    await this.audit(req.user.id, "UPDATE", id, current.rows[0], res.rows[0]);
    return mapPolicy(res.rows[0]!);
  }

  @Roles("RSSI", "ADMIN")
  @Delete(":id")
  async remove(@Param("id") id: string, @Req() req: { user: AuthUser }) {
    const current = await query(`SELECT * FROM policy WHERE id = $1`, [id]);
    if (!current.rows[0]) throw new NotFoundException("Politique introuvable");
    await query(`DELETE FROM policy WHERE id = $1`, [id]);
    await this.audit(req.user.id, "DELETE", id, current.rows[0], null);
    return { ok: true, id };
  }

  private async snapshot(row: Record<string, unknown>, userId: string) {
    await query(
      `INSERT INTO policy_version(policy_id, version, name, condition_expr, action, priority, enabled, reference_frameworks, changed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [row.id, row.version, row.name, row.condition_expr, row.action, row.priority, row.enabled, row.reference_frameworks, userId],
    );
  }

  private async audit(actorId: string, action: string, entityId: string, before: unknown, after: unknown) {
    await query(`INSERT INTO admin_audit_log(actor_id, action, entity_type, entity_id, before, after) VALUES ($1,$2,'policy',$3,$4,$5)`, [
      actorId,
      action,
      entityId,
      before ? JSON.stringify(before) : null,
      JSON.stringify(after),
    ]);
  }
}

function parseOrThrow<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(" · "));
  return parsed.data;
}

function mapPolicy(row: Record<string, unknown>): Policy {
  return {
    id: String(row.id),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    conditionExpr: String(row.condition_expr),
    action: row.action as Policy["action"],
    priority: Number(row.priority),
    version: Number(row.version),
    enabled: Boolean(row.enabled),
    referenceFrameworks: (row.reference_frameworks as string[]) ?? [],
    createdAt: row.created_at ? new Date(row.created_at as string).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at as string).toISOString() : undefined,
  };
}

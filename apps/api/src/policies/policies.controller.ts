import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  CreatePolicySchema,
  UpdatePolicySchema,
  lintCondition,
  parseCondition,
  explainCondition,
  type CreatePolicyInput,
  type Policy,
  type UpdatePolicyInput,
} from "@acg/shared";
import { query } from "../db.js";
import { Roles } from "../auth/guards.js";
import type { AuthUser } from "../auth/jwt.js";
import { canApprove, requiresApproval, type ChangeOperation } from "./approval.js";

type HttpResponse = { status(code: number): unknown };

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
  async create(@Body() body: unknown, @Req() req: { user: AuthUser }, @Res({ passthrough: true }) res: HttpResponse) {
    const input = parseOrThrow(CreatePolicySchema, body);
    assertCondition(input.conditionExpr);
    if (requiresApproval("CREATE", null, input)) {
      res.status(202);
      return this.requestChange("CREATE", null, input, null, req.user.id);
    }
    return mapPolicy(await this.applyCreate(input, req.user.id));
  }

  @Roles("RSSI", "ADMIN")
  @Put(":id")
  async update(@Param("id") id: string, @Body() body: unknown, @Req() req: { user: AuthUser }, @Res({ passthrough: true }) res: HttpResponse) {
    const input = parseOrThrow(UpdatePolicySchema, body);
    const current = await this.load(id);
    if (input.conditionExpr) assertCondition(input.conditionExpr);
    if (input.expectedVersion !== undefined && input.expectedVersion !== Number(current.version)) {
      throw new ConflictException("La règle a été modifiée entre-temps : rechargez-la");
    }
    if (requiresApproval("UPDATE", { action: current.action as Policy["action"] }, { action: input.action ?? null })) {
      res.status(202);
      return this.requestChange("UPDATE", id, input, Number(current.version), req.user.id);
    }
    return mapPolicy(await this.applyUpdate(current, input, req.user.id));
  }

  @Roles("RSSI", "ADMIN")
  @Delete(":id")
  async remove(@Param("id") id: string, @Req() req: { user: AuthUser }, @Res({ passthrough: true }) res: HttpResponse) {
    const current = await this.load(id);
    if (requiresApproval("DELETE", { action: current.action as Policy["action"] }, null)) {
      res.status(202);
      return this.requestChange("DELETE", id, null, Number(current.version), req.user.id);
    }
    await this.applyDelete(current, req.user.id);
    return { ok: true, id };
  }

  // ---------------------------------------------------------------------------
  // Double validation des règles BLOCK
  // ---------------------------------------------------------------------------

  @Get("/changes")
  async changes(@Query("status") status?: string) {
    const filter = status && ["pending", "approved", "rejected"].includes(status) ? status : null;
    const res = await query<Record<string, unknown>>(
      `SELECT c.*, p.name AS policy_name, p.action AS policy_action, p.version AS policy_version,
              ru.email AS requested_by_email, vu.email AS reviewed_by_email
         FROM policy_change_request c
         LEFT JOIN policy p ON p.id = c.policy_id
         LEFT JOIN app_user ru ON ru.id = c.requested_by
         LEFT JOIN app_user vu ON vu.id = c.reviewed_by
        WHERE ($1::text IS NULL OR c.status = $1)
        ORDER BY c.requested_at DESC
        LIMIT 200`,
      [filter],
    );
    return res.rows.map(mapChange);
  }

  @Roles("RSSI", "ADMIN")
  @Post("/changes/:id/approve")
  async approve(@Param("id") id: string, @Body() body: { comment?: string }, @Req() req: { user: AuthUser }) {
    const request = await this.loadChange(id);
    const current = request.policy_id ? await this.find(String(request.policy_id)) : null;
    const verdict = canApprove(
      { requestedBy: String(request.requested_by), status: String(request.status), baseVersion: request.base_version === null ? null : Number(request.base_version) },
      req.user.id,
      current ? Number(current.version) : null,
    );
    if (!verdict.ok) throw verdict.status === 403 ? new ForbiddenException(verdict.reason) : new ConflictException(verdict.reason);

    // Réservation atomique : deux approbateurs simultanés ne peuvent pas appliquer deux fois.
    const claimed = await this.review(id, "approved", req.user.id, body.comment);
    if (!claimed) throw new ConflictException("Demande déjà traitée");

    const requester = String(request.requested_by);
    const operation = request.operation as ChangeOperation;
    let policy: Record<string, unknown> | null = null;
    if (operation === "CREATE") policy = await this.applyCreate(request.payload as CreatePolicyInput, requester);
    else if (operation === "UPDATE") policy = await this.applyUpdate(current!, request.payload as UpdatePolicyInput, requester);
    else await this.applyDelete(current!, requester);

    if (policy && operation === "CREATE") {
      await query(`UPDATE policy_change_request SET policy_id = $2 WHERE id = $1`, [id, policy.id]);
    }
    await this.audit(req.user.id, `APPROVE_${operation}`, String(policy?.id ?? request.policy_id), null, { changeRequestId: id, comment: body.comment ?? null });
    return { ok: true, id, policy: policy ? mapPolicy(policy) : null };
  }

  @Roles("RSSI", "ADMIN")
  @Post("/changes/:id/reject")
  async reject(@Param("id") id: string, @Body() body: { comment?: string }, @Req() req: { user: AuthUser }) {
    const request = await this.loadChange(id);
    if (request.status !== "pending") throw new ConflictException("Demande déjà traitée");
    // L'auteur peut retirer sa propre demande : refuser ne modifie aucune règle.
    const claimed = await this.review(id, "rejected", request.requested_by === req.user.id ? null : req.user.id, body.comment);
    if (!claimed) throw new ConflictException("Demande déjà traitée");
    await this.audit(req.user.id, `REJECT_${request.operation}`, String(request.policy_id ?? id), null, { changeRequestId: id, comment: body.comment ?? null });
    return { ok: true, id };
  }

  // ---------------------------------------------------------------------------

  private async requestChange(operation: ChangeOperation, policyId: string | null, payload: unknown, baseVersion: number | null, userId: string) {
    const res = await query<Record<string, unknown>>(
      `INSERT INTO policy_change_request(policy_id, operation, payload, base_version, requested_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [policyId, operation, payload === null ? null : JSON.stringify(payload), baseVersion, userId],
    );
    const row = res.rows[0]!;
    await this.audit(userId, `REQUEST_${operation}`, String(policyId ?? row.id), null, { changeRequestId: row.id, payload });
    return {
      pendingApproval: true,
      message: "Changement touchant une règle BLOCK : il sera appliqué après approbation par un autre RSSI ou administrateur.",
      change: mapChange(row),
    };
  }

  private async review(id: string, status: "approved" | "rejected", reviewerId: string | null, comment?: string): Promise<boolean> {
    const res = await query(
      `UPDATE policy_change_request
          SET status = $2, reviewed_by = $3, reviewed_at = now(), review_comment = $4
        WHERE id = $1 AND status = 'pending'`,
      [id, status, reviewerId, comment?.trim() || null],
    );
    return (res.rowCount ?? 0) > 0;
  }

  private async applyCreate(input: CreatePolicyInput, userId: string) {
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
        userId,
      ],
    );
    const row = res.rows[0]!;
    await this.snapshot(row, userId);
    await this.audit(userId, "CREATE", String(row.id), null, row);
    return row;
  }

  private async applyUpdate(current: Record<string, unknown>, input: UpdatePolicyInput, userId: string) {
    const nextVersion = Number(current.version) + 1;
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
        current.id,
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
    await this.snapshot(res.rows[0]!, userId);
    await this.audit(userId, "UPDATE", String(current.id), current, res.rows[0]);
    return res.rows[0]!;
  }

  private async applyDelete(current: Record<string, unknown>, userId: string) {
    await query(`DELETE FROM policy WHERE id = $1`, [current.id]);
    await this.audit(userId, "DELETE", String(current.id), current, null);
  }

  private async find(id: string): Promise<Record<string, unknown> | null> {
    const res = await query<Record<string, unknown>>(`SELECT * FROM policy WHERE id = $1`, [id]);
    return res.rows[0] ?? null;
  }

  private async load(id: string): Promise<Record<string, unknown>> {
    const row = await this.find(id);
    if (!row) throw new NotFoundException("Politique introuvable");
    return row;
  }

  private async loadChange(id: string): Promise<Record<string, unknown>> {
    const res = await query<Record<string, unknown>>(`SELECT * FROM policy_change_request WHERE id = $1`, [id]);
    if (!res.rows[0]) throw new NotFoundException("Demande introuvable");
    return res.rows[0];
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

function assertCondition(expr: string) {
  const errors = lintCondition(expr);
  if (errors.length) throw new BadRequestException(errors.join(" · "));
}

function parseOrThrow<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(" · "));
  return parsed.data;
}

function iso(value: unknown): string | null {
  return value ? new Date(value as string).toISOString() : null;
}

function mapChange(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    policyId: (row.policy_id as string | null) ?? null,
    policyName: (row.policy_name as string | null) ?? null,
    policyAction: (row.policy_action as string | null) ?? null,
    policyVersion: row.policy_version === undefined || row.policy_version === null ? null : Number(row.policy_version),
    operation: row.operation as ChangeOperation,
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    baseVersion: row.base_version === null ? null : Number(row.base_version),
    requestedBy: String(row.requested_by),
    requestedByEmail: (row.requested_by_email as string | null) ?? null,
    requestedAt: iso(row.requested_at),
    status: row.status as "pending" | "approved" | "rejected",
    reviewedBy: (row.reviewed_by as string | null) ?? null,
    reviewedByEmail: (row.reviewed_by_email as string | null) ?? null,
    reviewedAt: iso(row.reviewed_at),
    reviewComment: (row.review_comment as string | null) ?? null,
  };
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

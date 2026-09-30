import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import { CreateUserSchema, UpdateUserSchema, type UserRole } from "@acg/shared";
import { query } from "../db.js";
import { Roles } from "../auth/guards.js";
import type { AuthUser } from "../auth/jwt.js";
import { hashPassword } from "../passwords.js";

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  department: string;
  role: UserRole;
  jurisdiction: string;
  is_active: boolean;
  created_at: Date;
};

@Controller("/v1/users")
export class UsersController {
  @Roles("RSSI", "ADMIN")
  @Get("/departments")
  async departments() {
    const res = await query<{ name: string; risk_history_level: string }>(
      `SELECT name, risk_history_level FROM reference.department ORDER BY name`,
    );
    return res.rows.map((d) => ({ name: d.name, riskHistoryLevel: d.risk_history_level }));
  }

  @Roles("RSSI", "ADMIN")
  @Get()
  async list() {
    const res = await query<UserRow>(
      `SELECT id, email, display_name, department, role, jurisdiction, is_active, created_at
         FROM app_user
        ORDER BY is_active DESC, display_name ASC`,
    );
    return res.rows.map(mapUser);
  }

  @Roles("RSSI", "ADMIN")
  @Get(":id")
  async get(@Param("id") id: string) {
    const res = await query<UserRow>(
      `SELECT id, email, display_name, department, role, jurisdiction, is_active, created_at
         FROM app_user WHERE id = $1`,
      [id],
    );
    if (!res.rows[0]) throw new NotFoundException("Utilisateur introuvable");
    return mapUser(res.rows[0]);
  }

  @Roles("RSSI", "ADMIN")
  @Post()
  async create(@Body() body: unknown, @Req() req: { user: AuthUser }) {
    const input = parseOrThrow(CreateUserSchema, body);
    await assertDepartment(input.department);
    const exists = await query(`SELECT id FROM app_user WHERE lower(email) = lower($1)`, [input.email]);
    if (exists.rows[0]) throw new ConflictException("Un utilisateur avec cet e-mail existe déjà");
    const passwordHash = await hashPassword(input.password);
    const res = await query<UserRow>(
      `INSERT INTO app_user(email, display_name, password_hash, department, role, jurisdiction, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, email, display_name, department, role, jurisdiction, is_active, created_at`,
      [
        input.email.trim().toLowerCase(),
        input.displayName.trim(),
        passwordHash,
        input.department,
        input.role,
        input.jurisdiction ?? "BJ",
        input.isActive ?? true,
      ],
    );
    const row = res.rows[0]!;
    await audit(req.user.id, "CREATE", row.id, null, sanitize(row));
    return mapUser(row);
  }

  @Roles("RSSI", "ADMIN")
  @Put(":id")
  async update(@Param("id") id: string, @Body() body: unknown, @Req() req: { user: AuthUser }) {
    const input = parseOrThrow(UpdateUserSchema, body);
    const current = await query<UserRow>(
      `SELECT id, email, display_name, department, role, jurisdiction, is_active, created_at
         FROM app_user WHERE id = $1`,
      [id],
    );
    if (!current.rows[0]) throw new NotFoundException("Utilisateur introuvable");
    const before = current.rows[0];

    if (input.department) await assertDepartment(input.department);
    if (input.email) {
      const clash = await query(`SELECT id FROM app_user WHERE lower(email) = lower($1) AND id <> $2`, [
        input.email,
        id,
      ]);
      if (clash.rows[0]) throw new ConflictException("Un utilisateur avec cet e-mail existe déjà");
    }

    if (id === req.user.id) {
      if (input.isActive === false) throw new BadRequestException("Vous ne pouvez pas désactiver votre propre compte");
      if (input.role && input.role !== before.role && before.role === "ADMIN") {
        throw new BadRequestException("Vous ne pouvez pas modifier votre propre rôle administrateur");
      }
    }

    if (input.role && input.role !== before.role) {
      await assertNotLastPrivileged(before);
    }
    if (input.isActive === false && before.is_active) {
      await assertNotLastPrivileged(before);
    }

    const passwordHash = input.password ? await hashPassword(input.password) : null;
    const res = await query<UserRow>(
      `UPDATE app_user SET
         email = COALESCE($2, email),
         display_name = COALESCE($3, display_name),
         department = COALESCE($4, department),
         role = COALESCE($5, role),
         jurisdiction = COALESCE($6, jurisdiction),
         is_active = COALESCE($7, is_active),
         password_hash = COALESCE($8, password_hash)
       WHERE id = $1
       RETURNING id, email, display_name, department, role, jurisdiction, is_active, created_at`,
      [
        id,
        input.email?.trim().toLowerCase() ?? null,
        input.displayName?.trim() ?? null,
        input.department ?? null,
        input.role ?? null,
        input.jurisdiction ?? null,
        input.isActive ?? null,
        passwordHash,
      ],
    );
    const row = res.rows[0]!;
    await audit(req.user.id, "UPDATE", id, sanitize(before), sanitize(row));
    return mapUser(row);
  }

  @Roles("RSSI", "ADMIN")
  @Delete(":id")
  async remove(@Param("id") id: string, @Req() req: { user: AuthUser }) {
    if (id === req.user.id) throw new BadRequestException("Vous ne pouvez pas supprimer votre propre compte");
    const current = await query<UserRow>(
      `SELECT id, email, display_name, department, role, jurisdiction, is_active, created_at
         FROM app_user WHERE id = $1`,
      [id],
    );
    if (!current.rows[0]) throw new NotFoundException("Utilisateur introuvable");
    const before = current.rows[0];
    if (!before.is_active) return { ok: true, id, alreadyInactive: true };

    await assertNotLastPrivileged(before);
    const res = await query<UserRow>(
      `UPDATE app_user SET is_active = false
        WHERE id = $1
        RETURNING id, email, display_name, department, role, jurisdiction, is_active, created_at`,
      [id],
    );
    await audit(req.user.id, "DEACTIVATE", id, sanitize(before), sanitize(res.rows[0]!));
    return { ok: true, id };
  }
}

async function assertDepartment(name: string) {
  const res = await query(`SELECT name FROM reference.department WHERE name = $1`, [name]);
  if (!res.rows[0]) throw new BadRequestException(`Direction inconnue : ${name}`);
}

async function assertNotLastPrivileged(user: UserRow) {
  if (user.role !== "RSSI" && user.role !== "ADMIN") return;
  const remaining = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM app_user
      WHERE is_active = true AND role IN ('RSSI','ADMIN') AND id <> $1`,
    [user.id],
  );
  if (Number(remaining.rows[0]?.count ?? 0) === 0) {
    throw new BadRequestException("Impossible de retirer le dernier compte RSSI/ADMIN actif");
  }
}

async function audit(actorId: string, action: string, entityId: string, before: unknown, after: unknown) {
  await query(`INSERT INTO admin_audit_log(actor_id, action, entity_type, entity_id, before, after) VALUES ($1,$2,'app_user',$3,$4,$5)`, [
    actorId,
    action,
    entityId,
    before ? JSON.stringify(before) : null,
    after ? JSON.stringify(after) : null,
  ]);
}

function sanitize(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    department: row.department,
    role: row.role,
    jurisdiction: row.jurisdiction,
    isActive: row.is_active,
  };
}

function mapUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    department: row.department,
    role: row.role,
    jurisdiction: row.jurisdiction,
    isActive: row.is_active,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
  };
}

function parseOrThrow<T>(
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } },
  body: unknown,
): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(" · "));
  return parsed.data;
}

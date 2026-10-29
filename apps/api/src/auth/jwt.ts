import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../env.js";
import { query } from "../db.js";
import type { UserRole } from "@acg/shared";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  department: string;
  departmentRiskLevel: "low" | "moderate" | "high";
  role: UserRole;
  jurisdiction: string;
  /** Session ouverte avec second facteur (TOTP) — exigé pour la levée d'anonymat. */
  mfa?: boolean;
}

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: "Bearer";
};

const secret = new TextEncoder().encode(env.jwtSecret);

function hashOpaqueToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function newOpaqueToken(): string {
  return randomBytes(48).toString("base64url");
}

export async function signAccessToken(user: AuthUser): Promise<{ token: string; jti: string; expiresAt: Date }> {
  const jti = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + env.jwtTtlSeconds * 1000);
  const token = await new SignJWT({
    email: user.email,
    displayName: user.displayName,
    department: user.department,
    departmentRiskLevel: user.departmentRiskLevel,
    role: user.role,
    jurisdiction: user.jurisdiction,
    mfa: user.mfa === true,
    typ: "access",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${env.jwtTtlSeconds}s`)
    .sign(secret);
  return { token, jti, expiresAt };
}

export async function verifyAccessToken(token: string): Promise<AuthUser & { jti: string }> {
  const { payload } = await jwtVerify(token, secret);
  if (payload.typ && payload.typ !== "access") {
    throw new Error("Type de jeton invalide");
  }
  const jti = String(payload.jti ?? "");
  if (!jti) throw new Error("JTI manquant");

  const revoked = await query(`SELECT 1 FROM auth_revoked_access WHERE jti = $1 AND expires_at > now()`, [jti]);
  if (revoked.rows[0]) throw new Error("Jeton révoqué");

  return {
    id: payload.sub!,
    email: String(payload.email),
    displayName: String(payload.displayName),
    department: String(payload.department),
    departmentRiskLevel: payload.departmentRiskLevel as AuthUser["departmentRiskLevel"],
    role: payload.role as UserRole,
    jurisdiction: String(payload.jurisdiction),
    mfa: payload.mfa === true,
    jti,
  };
}

export type MfaChallengePurpose = "mfa" | "mfa-setup";

/**
 * Jeton intermédiaire après un mot de passe correct : ne donne accès qu'à la saisie
 * (ou à l'activation) du second facteur, pendant 5 minutes. Refusé comme jeton d'accès.
 */
export async function signMfaChallenge(userId: string, purpose: MfaChallengePurpose): Promise<string> {
  return new SignJWT({ typ: purpose })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);
}

export async function verifyMfaChallenge(token: string, purpose: MfaChallengePurpose): Promise<string> {
  const { payload } = await jwtVerify(token, secret);
  if (payload.typ !== purpose || !payload.sub) throw new Error("Jeton de second facteur invalide");
  return payload.sub;
}

export async function issueTokenPair(
  user: AuthUser,
  meta?: { userAgent?: string; ip?: string },
): Promise<TokenPair> {
  const access = await signAccessToken(user);
  const refreshRaw = newOpaqueToken();
  const refreshHash = hashOpaqueToken(refreshRaw);
  const refreshExpires = new Date(Date.now() + env.jwtRefreshTtlSeconds * 1000);

  await query(
    `INSERT INTO auth_refresh_token(user_id, token_hash, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, refreshHash, refreshExpires.toISOString(), meta?.userAgent ?? null, meta?.ip ?? null],
  );

  return {
    accessToken: access.token,
    refreshToken: refreshRaw,
    expiresIn: env.jwtTtlSeconds,
    tokenType: "Bearer",
  };
}

export async function rotateRefreshToken(
  refreshRaw: string,
  meta?: { userAgent?: string; ip?: string },
): Promise<{ pair: TokenPair; user: AuthUser } | null> {
  const hash = hashOpaqueToken(refreshRaw);
  const row = await query<{
    id: string;
    user_id: string;
    expires_at: Date;
    revoked_at: Date | null;
  }>(
    `SELECT id, user_id, expires_at, revoked_at
       FROM auth_refresh_token
      WHERE token_hash = $1`,
    [hash],
  );
  const token = row.rows[0];
  if (!token || token.revoked_at || token.expires_at.getTime() <= Date.now()) {
    return null;
  }

  await query(`UPDATE auth_refresh_token SET revoked_at = now(), last_used_at = now() WHERE id = $1`, [token.id]);

  const userRes = await query<{
    id: string;
    email: string;
    display_name: string;
    department: string;
    role: UserRole;
    jurisdiction: string;
    is_active: boolean;
    risk_history_level: AuthUser["departmentRiskLevel"];
    totp_enabled_at: Date | null;
  }>(
    `SELECT u.id, u.email, u.display_name, u.department, u.role, u.jurisdiction, u.is_active,
            u.totp_enabled_at, d.risk_history_level
       FROM app_user u
       JOIN reference.department d ON d.name = u.department
      WHERE u.id = $1`,
    [token.user_id],
  );
  const u = userRes.rows[0];
  if (!u || !u.is_active) return null;
  // Une session ouverte avant l'obligation du second facteur ne peut pas la contourner.
  if (!u.totp_enabled_at && env.mfaRequiredRoles.includes(u.role)) return null;

  const user: AuthUser = {
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    department: u.department,
    departmentRiskLevel: u.risk_history_level,
    role: u.role,
    jurisdiction: u.jurisdiction,
    // Un compte à TOTP actif n'obtient de session qu'après le second facteur.
    mfa: Boolean(u.totp_enabled_at),
  };

  const pair = await issueTokenPair(user, meta);
  return { pair, user };
}

export async function revokeRefreshToken(refreshRaw: string): Promise<void> {
  const hash = hashOpaqueToken(refreshRaw);
  await query(
    `UPDATE auth_refresh_token SET revoked_at = now()
      WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hash],
  );
}

export async function revokeAllRefreshTokensForUser(userId: string): Promise<void> {
  await query(
    `UPDATE auth_refresh_token SET revoked_at = now()
      WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
}

export async function revokeAccessToken(jti: string, userId: string, expiresAt: Date, reason: string): Promise<void> {
  await query(
    `INSERT INTO auth_revoked_access(jti, user_id, expires_at, reason)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (jti) DO NOTHING`,
    [jti, userId, expiresAt.toISOString(), reason],
  );
}

/** Nettoyage opportuniste des lignes expirées. */
export async function purgeExpiredAuthRows(): Promise<void> {
  await query(`DELETE FROM auth_revoked_access WHERE expires_at < now()`);
  await query(`DELETE FROM auth_refresh_token WHERE expires_at < now() - interval '7 days'`);
}

/** @deprecated use signAccessToken / issueTokenPair */
export async function signUserToken(user: AuthUser): Promise<string> {
  const { token } = await signAccessToken(user);
  return token;
}

/** @deprecated use verifyAccessToken */
export async function verifyUserToken(token: string): Promise<AuthUser> {
  const u = await verifyAccessToken(token);
  const { jti: _jti, ...user } = u;
  return user;
}

import { Body, Controller, Get, HttpException, HttpStatus, Param, Post, Req, UnauthorizedException } from "@nestjs/common";
import { decodeJwt } from "jose";
import type { UserRole } from "@acg/shared";
import { query } from "../db.js";
import { env } from "../env.js";
import { verifyPassword } from "../passwords.js";
import { Public, Roles } from "./guards.js";
import {
  issueTokenPair,
  purgeExpiredAuthRows,
  revokeAccessToken,
  revokeAllRefreshTokensForUser,
  revokeRefreshToken,
  rotateRefreshToken,
  signMfaChallenge,
  verifyMfaChallenge,
  type AuthUser,
  type MfaChallengePurpose,
} from "./jwt.js";
import { activateTotp, beginSetup, loadAuthUser, mfaRequiredFor, mfaStatus, resetTotp, verifyUserTotp } from "./mfa.js";
import {
  assertLoginRateLimit,
  assertNotLocked,
  clearFailedLogins,
  clientIp,
  recordFailedLogin,
  remainingAttemptsHint,
  throwAccountLocked,
} from "./login-guard.js";

@Controller("/v1/auth")
export class AuthController {
  @Public()
  @Post("/login")
  async login(
    @Body() body: { email?: string; password?: string },
    @Req() req: { ip?: string; headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } },
  ) {
    const ip = clientIp(req);
    assertLoginRateLimit(ip);

    if (!body.email || !body.password) throw new UnauthorizedException("Identifiants requis");

    await assertNotLocked(body.email);

    const res = await query<{
      id: string;
      email: string;
      display_name: string;
      department: string;
      role: UserRole;
      jurisdiction: string;
      password_hash: string | null;
      is_active: boolean;
      risk_history_level: "low" | "moderate" | "high";
      totp_enabled_at: Date | null;
    }>(
      `SELECT u.id, u.email, u.display_name, u.department, u.role, u.jurisdiction, u.password_hash, u.is_active,
              u.totp_enabled_at, d.risk_history_level
         FROM app_user u
         JOIN reference.department d ON d.name = u.department
        WHERE lower(u.email) = lower($1)`,
      [body.email],
    );
    const user = res.rows[0];
    const invalid =
      !user || !user.is_active || !user.password_hash || !(await verifyPassword(body.password, user.password_hash));

    if (invalid) {
      const fail = await recordFailedLogin(body.email);
      if (fail.lockedUntil && fail.lockedUntil.getTime() > Date.now()) {
        throwAccountLocked(fail.lockedUntil);
      }
      const hint = remainingAttemptsHint(fail.attempts);
      throw new HttpException(
        {
          statusCode: HttpStatus.UNAUTHORIZED,
          code: "INVALID_CREDENTIALS",
          message: hint ? `Identifiants incorrects. ${hint}` : "Identifiants incorrects.",
          remainingAttempts: Math.max(0, env.loginMaxAttempts - fail.attempts),
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Mot de passe correct : la session n'est ouverte qu'après le second facteur s'il est
    // actif, ou après son activation s'il est obligatoire pour ce rôle. Le compteur d'échecs
    // n'est remis à zéro qu'une fois le second facteur validé.
    if (user.totp_enabled_at) {
      return { mfaRequired: true, mfaToken: await signMfaChallenge(user.id, "mfa") };
    }
    if (mfaRequiredFor(user.role)) {
      return { mfaSetupRequired: true, mfaToken: await signMfaChallenge(user.id, "mfa-setup") };
    }

    await clearFailedLogins(user.id);
    void purgeExpiredAuthRows();

    const auth: AuthUser = {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      department: user.department,
      departmentRiskLevel: user.risk_history_level,
      role: user.role,
      jurisdiction: user.jurisdiction,
    };

    const pair = await issueTokenPair(auth, {
      ip,
      userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined,
    });

    return {
      ...pair,
      token: pair.accessToken,
      user: auth,
    };
  }

  @Public()
  @Post("/refresh")
  async refresh(
    @Body() body: { refreshToken?: string },
    @Req() req: { ip?: string; headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } },
  ) {
    if (!body.refreshToken) throw new UnauthorizedException("Refresh token requis");
    const rotated = await rotateRefreshToken(body.refreshToken, {
      ip: clientIp(req),
      userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined,
    });
    if (!rotated) throw new UnauthorizedException("Refresh token invalide ou expiré");
    return {
      ...rotated.pair,
      token: rotated.pair.accessToken,
      user: rotated.user,
    };
  }

  @Post("/logout")
  async logout(
    @Req() req: { user: AuthUser & { jti: string }; headers: Record<string, string | undefined> },
    @Body() body: { refreshToken?: string; revokeAll?: boolean },
  ) {
    const header = req.headers.authorization ?? req.headers.Authorization;
    if (header?.startsWith("Bearer ") && req.user.jti) {
      const decoded = decodeJwt(header.slice(7));
      const exp =
        typeof decoded.exp === "number"
          ? new Date(decoded.exp * 1000)
          : new Date(Date.now() + env.jwtTtlSeconds * 1000);
      await revokeAccessToken(req.user.jti, req.user.id, exp, "logout");
    }

    if (body.revokeAll) {
      await revokeAllRefreshTokensForUser(req.user.id);
    } else if (body.refreshToken) {
      await revokeRefreshToken(body.refreshToken);
    }

    return { ok: true };
  }

  @Get("/me")
  me(@Req() req: { user: AuthUser }) {
    return req.user;
  }

  // ---------------------------------------------------------------------------
  // Second facteur TOTP
  // ---------------------------------------------------------------------------

  /** Étape 2 de la connexion : code TOTP après le mot de passe. */
  @Public()
  @Post("/mfa/verify")
  async mfaVerify(@Body() body: { mfaToken?: string; code?: string }, @Req() req: LoginRequest) {
    const ip = clientIp(req);
    assertLoginRateLimit(ip);
    const userId = await challengeUser(body.mfaToken, "mfa");
    const email = await userEmail(userId);
    await assertNotLocked(email);
    if (!(await verifyUserTotp(userId, String(body.code ?? "")))) await failMfa(email);
    return this.openSession(userId, req);
  }

  /** Activation imposée (rôle à second facteur obligatoire) : génère le secret à scanner. */
  @Public()
  @Post("/mfa/setup")
  async mfaSetup(@Body() body: { mfaToken?: string }) {
    const userId = await challengeUser(body.mfaToken, "mfa-setup");
    return beginSetup(userId);
  }

  /** Activation imposée : le premier code valide active le second facteur et ouvre la session. */
  @Public()
  @Post("/mfa/activate")
  async mfaActivate(@Body() body: { mfaToken?: string; code?: string }, @Req() req: LoginRequest) {
    const ip = clientIp(req);
    assertLoginRateLimit(ip);
    const userId = await challengeUser(body.mfaToken, "mfa-setup");
    const email = await userEmail(userId);
    await assertNotLocked(email);
    if (!(await activateTotp(userId, String(body.code ?? "")))) await failMfa(email);
    await auditMfa(userId, userId, "MFA_ENABLE");
    return this.openSession(userId, req);
  }

  @Get("/mfa/status")
  async mfaStatusSelf(@Req() req: { user: AuthUser }) {
    return { ...(await mfaStatus(req.user.id)), required: mfaRequiredFor(req.user.role), sessionMfa: req.user.mfa === true };
  }

  /** Activation volontaire depuis le profil (rôle sans obligation). */
  @Post("/mfa/setup-self")
  async mfaSetupSelf(@Req() req: { user: AuthUser }) {
    return beginSetup(req.user.id);
  }

  @Post("/mfa/activate-self")
  async mfaActivateSelf(@Body() body: { code?: string }, @Req() req: LoginRequest & { user: AuthUser }) {
    if (!(await activateTotp(req.user.id, String(body.code ?? "")))) {
      throw new UnauthorizedException("Code invalide");
    }
    await auditMfa(req.user.id, req.user.id, "MFA_ENABLE");
    return this.openSession(req.user.id, req);
  }

  /** Réinitialisation par un administrateur (téléphone perdu) : l'utilisateur devra réactiver. */
  @Roles("ADMIN")
  @Post("/mfa/reset/:userId")
  async mfaReset(@Param("userId") userId: string, @Req() req: { user: AuthUser }) {
    await resetTotp(userId);
    await revokeAllRefreshTokensForUser(userId);
    await auditMfa(req.user.id, userId, "MFA_RESET");
    return { ok: true };
  }

  private async openSession(userId: string, req: LoginRequest) {
    const auth = await loadAuthUser(userId, true);
    if (!auth) throw new UnauthorizedException("Compte inactif");
    await clearFailedLogins(userId);
    const pair = await issueTokenPair(auth, {
      ip: clientIp(req),
      userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined,
    });
    return { ...pair, token: pair.accessToken, user: auth };
  }
}

type LoginRequest = { ip?: string; headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } };

async function challengeUser(token: string | undefined, purpose: MfaChallengePurpose): Promise<string> {
  if (!token) throw new UnauthorizedException("Jeton de second facteur requis");
  try {
    return await verifyMfaChallenge(token, purpose);
  } catch {
    throw new UnauthorizedException("Étape de connexion expirée : recommencez");
  }
}

async function userEmail(userId: string): Promise<string> {
  const res = await query<{ email: string }>(`SELECT email FROM app_user WHERE id = $1`, [userId]);
  if (!res.rows[0]) throw new UnauthorizedException("Compte introuvable");
  return res.rows[0].email;
}

/** Un code faux compte comme un échec de connexion (même verrouillage que le mot de passe). */
async function failMfa(email: string): Promise<never> {
  const fail = await recordFailedLogin(email);
  if (fail.lockedUntil && fail.lockedUntil.getTime() > Date.now()) throwAccountLocked(fail.lockedUntil);
  throw new HttpException(
    { statusCode: HttpStatus.UNAUTHORIZED, code: "INVALID_MFA_CODE", message: "Code invalide ou déjà utilisé." },
    HttpStatus.UNAUTHORIZED,
  );
}

async function auditMfa(actorId: string, userId: string, action: "MFA_ENABLE" | "MFA_RESET"): Promise<void> {
  await query(`INSERT INTO admin_audit_log(actor_id, action, entity_type, entity_id, before, after) VALUES ($1,$2,'user',$3,NULL,$4)`, [
    actorId,
    action,
    userId,
    JSON.stringify({ at: new Date().toISOString() }),
  ]);
}

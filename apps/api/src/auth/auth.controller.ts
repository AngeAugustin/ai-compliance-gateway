import { Body, Controller, Get, HttpException, HttpStatus, Post, Req, UnauthorizedException } from "@nestjs/common";
import { decodeJwt } from "jose";
import type { UserRole } from "@acg/shared";
import { query } from "../db.js";
import { env } from "../env.js";
import { verifyPassword } from "../passwords.js";
import { Public } from "./guards.js";
import {
  issueTokenPair,
  purgeExpiredAuthRows,
  revokeAccessToken,
  revokeAllRefreshTokensForUser,
  revokeRefreshToken,
  rotateRefreshToken,
  type AuthUser,
} from "./jwt.js";
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
    }>(
      `SELECT u.id, u.email, u.display_name, u.department, u.role, u.jurisdiction, u.password_hash, u.is_active,
              d.risk_history_level
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
}

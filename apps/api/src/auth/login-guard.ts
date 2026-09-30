import { HttpException, HttpStatus } from "@nestjs/common";
import { env } from "../env.js";
import { query } from "../db.js";

type Bucket = { count: number; resetAt: number };
const ipBuckets = new Map<string, Bucket>();

export type LockoutState = {
  failedLoginAttempts: number;
  lockedUntil: Date | null;
};

export function assertLoginRateLimit(ip: string): void {
  const now = Date.now();
  const windowMs = 60_000;
  const key = ip || "unknown";
  let bucket = ipBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    ipBuckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > env.loginRateLimitPerMinute) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: "RATE_LIMITED",
        message: `Trop de tentatives depuis cette adresse. Réessayez dans ${retryAfterSeconds} s.`,
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export function throwAccountLocked(lockedUntil: Date): never {
  const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000));
  throw new HttpException(
    {
      statusCode: HttpStatus.LOCKED,
      code: "ACCOUNT_LOCKED",
      message: `Compte temporairement verrouillé après trop d'échecs. Réessayez dans ${formatDuration(retryAfterSeconds)}.`,
      lockedUntil: lockedUntil.toISOString(),
      retryAfterSeconds,
    },
    HttpStatus.LOCKED,
  );
}

export async function loadLockout(email: string): Promise<LockoutState | null> {
  const res = await query<{ failed_login_attempts: number; locked_until: Date | null }>(
    `SELECT failed_login_attempts, locked_until FROM app_user WHERE lower(email) = lower($1)`,
    [email],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    failedLoginAttempts: Number(row.failed_login_attempts ?? 0),
    lockedUntil: row.locked_until,
  };
}

export async function assertNotLocked(email: string): Promise<void> {
  const state = await loadLockout(email);
  if (!state?.lockedUntil) return;
  if (state.lockedUntil.getTime() > Date.now()) {
    throwAccountLocked(state.lockedUntil);
  }
  // verrou expiré → reset
  await query(
    `UPDATE app_user SET failed_login_attempts = 0, locked_until = NULL WHERE lower(email) = lower($1)`,
    [email],
  );
}

export async function recordFailedLogin(email: string): Promise<{ lockedUntil: Date | null; attempts: number }> {
  const res = await query<{ failed_login_attempts: number; locked_until: Date | null }>(
    `UPDATE app_user
        SET failed_login_attempts = failed_login_attempts + 1,
            locked_until = CASE
              WHEN failed_login_attempts + 1 >= $2
              THEN now() + ($3::text || ' seconds')::interval
              ELSE locked_until
            END
      WHERE lower(email) = lower($1)
      RETURNING failed_login_attempts, locked_until`,
    [email, env.loginMaxAttempts, String(env.loginLockoutSeconds)],
  );
  const row = res.rows[0];
  if (!row) return { lockedUntil: null, attempts: 0 };
  return {
    attempts: Number(row.failed_login_attempts),
    lockedUntil: row.locked_until,
  };
}

export async function clearFailedLogins(userId: string): Promise<void> {
  await query(`UPDATE app_user SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`, [userId]);
}

export function remainingAttemptsHint(attempts: number): string | null {
  const left = env.loginMaxAttempts - attempts;
  if (left <= 0) return null;
  if (left <= 2) return `Il vous reste ${left} tentative${left > 1 ? "s" : ""} avant verrouillage.`;
  return null;
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m <= 0) return `${s} s`;
  if (s === 0) return `${m} min`;
  return `${m} min ${s} s`;
}

export function clientIp(req: {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0]!.trim();
  if (Array.isArray(forwarded) && forwarded[0]) return forwarded[0].split(",")[0]!.trim();
  return req.ip || req.socket?.remoteAddress || "unknown";
}

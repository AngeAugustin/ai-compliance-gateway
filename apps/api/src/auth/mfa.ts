import { BadRequestException, NotFoundException } from "@nestjs/common";
import { decryptValue, encryptValue, importMasterKey } from "@acg/vault";
import type { UserRole } from "@acg/shared";
import { query } from "../db.js";
import { env } from "../env.js";
import type { AuthUser } from "./jwt.js";
import { generateTotpSecret, otpauthUri, qrDataUrl, verifyTotp } from "./totp.js";

/**
 * Second facteur TOTP. Le secret est stocké chiffré par la clé maîtresse du Vault ;
 * le dernier pas accepté est mémorisé pour refuser le rejeu d'un code.
 */
let masterKey: Promise<CryptoKey> | null = null;
const key = () => (masterKey ??= importMasterKey(env.vaultMasterKey));

export function mfaRequiredFor(role: UserRole): boolean {
  return env.mfaRequiredRoles.includes(role);
}

interface TotpRow {
  email: string;
  totp_secret_encrypted: Buffer | null;
  totp_enabled_at: Date | null;
  totp_last_step: string | null;
}

async function totpRow(userId: string): Promise<TotpRow | null> {
  const res = await query<TotpRow>(`SELECT email, totp_secret_encrypted, totp_enabled_at, totp_last_step FROM app_user WHERE id = $1`, [userId]);
  return res.rows[0] ?? null;
}

export async function mfaStatus(userId: string): Promise<{ enabled: boolean; enabledAt: string | null }> {
  const row = await totpRow(userId);
  return { enabled: Boolean(row?.totp_enabled_at), enabledAt: row?.totp_enabled_at?.toISOString() ?? null };
}

/** Nouveau secret en attente d'activation (remplace un secret non activé, jamais un secret actif). */
export async function beginSetup(userId: string): Promise<{ secret: string; otpauthUri: string; qrDataUrl: string | null }> {
  const row = await totpRow(userId);
  if (!row) throw new NotFoundException("Utilisateur introuvable");
  if (row.totp_enabled_at) throw new BadRequestException("Second facteur déjà actif");
  const secret = generateTotpSecret();
  const encrypted = await encryptValue(await key(), secret);
  await query(`UPDATE app_user SET totp_secret_encrypted = $2, totp_last_step = NULL WHERE id = $1`, [userId, Buffer.from(encrypted)]);
  const uri = otpauthUri(env.mfaIssuer, row.email, secret);
  return { secret, otpauthUri: uri, qrDataUrl: await qrDataUrl(uri) };
}

async function check(userId: string, code: string, mustBeEnabled: boolean): Promise<boolean> {
  const row = await totpRow(userId);
  if (!row?.totp_secret_encrypted) return false;
  if (mustBeEnabled !== Boolean(row.totp_enabled_at)) return false;
  const secret = await decryptValue(await key(), new Uint8Array(row.totp_secret_encrypted));
  const step = verifyTotp(secret, code, row.totp_last_step === null ? null : Number(row.totp_last_step));
  if (step === null) return false;
  await query(
    `UPDATE app_user SET totp_last_step = $2${mustBeEnabled ? "" : ", totp_enabled_at = now()"} WHERE id = $1`,
    [userId, step],
  );
  return true;
}

/** Active le secret en attente : le premier code prouve que l'application est bien configurée. */
export const activateTotp = (userId: string, code: string) => check(userId, code, false);

/** Vérifie un code pour un compte dont le second facteur est actif. */
export const verifyUserTotp = (userId: string, code: string) => check(userId, code, true);

export async function resetTotp(userId: string): Promise<void> {
  await query(`UPDATE app_user SET totp_secret_encrypted = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = $1`, [userId]);
}

export async function loadAuthUser(userId: string, mfa: boolean): Promise<AuthUser | null> {
  const res = await query<{
    id: string;
    email: string;
    display_name: string;
    department: string;
    role: UserRole;
    jurisdiction: string;
    is_active: boolean;
    risk_history_level: AuthUser["departmentRiskLevel"];
  }>(
    `SELECT u.id, u.email, u.display_name, u.department, u.role, u.jurisdiction, u.is_active, d.risk_history_level
       FROM app_user u JOIN reference.department d ON d.name = u.department
      WHERE u.id = $1`,
    [userId],
  );
  const u = res.rows[0];
  if (!u || !u.is_active) return null;
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    department: u.department,
    departmentRiskLevel: u.risk_history_level,
    role: u.role,
    jurisdiction: u.jurisdiction,
    mfa,
  };
}

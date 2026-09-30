import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from "@nestjs/common";
import type { UserRole } from "@acg/shared";
import { verifyAccessToken, type AuthUser } from "./jwt.js";
import { query } from "../db.js";
import { importPublicKey, verifyPayload } from "@acg/shared";

export const ROLES_KEY = "roles";
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export const IS_PUBLIC = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const IS_AGENT = "isAgent";
export const AgentAuth = () => SetMetadata(IS_AGENT, true);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): Promise<boolean> {
    const handlerPublic = Reflect.getMetadata(IS_PUBLIC, context.getHandler());
    const classPublic = Reflect.getMetadata(IS_PUBLIC, context.getClass());
    if (handlerPublic || classPublic) return Promise.resolve(true);
    const agent = Reflect.getMetadata(IS_AGENT, context.getHandler()) || Reflect.getMetadata(IS_AGENT, context.getClass());
    const req = context.switchToHttp().getRequest();
    if (agent) return authenticateAgent(req);
    const roles =
      (Reflect.getMetadata(ROLES_KEY, context.getHandler()) as UserRole[] | undefined) ??
      (Reflect.getMetadata(ROLES_KEY, context.getClass()) as UserRole[] | undefined);
    return authenticateUser(req, roles);
  }
}

async function authenticateUser(req: { headers: Record<string, string | undefined>; user?: AuthUser }, roles?: UserRole[]): Promise<boolean> {
  const header = req.headers.authorization ?? req.headers.Authorization;
  if (!header?.startsWith("Bearer ")) throw new UnauthorizedException("Jeton manquant");
  try {
    const user = await verifyAccessToken(header.slice(7));
    req.user = user;
    if (roles && roles.length > 0 && !roles.includes(user.role) && user.role !== "ADMIN") {
      throw new ForbiddenException("Rôle insuffisant");
    }
    return true;
  } catch (err) {
    if (err instanceof ForbiddenException) throw err;
    throw new UnauthorizedException("Jeton invalide");
  }
}

async function authenticateAgent(req: {
  headers: Record<string, string | undefined>;
  agent?: { agentId: string; userId: string | null; module: string };
}): Promise<boolean> {
  const agentId = req.headers["x-agent-id"];
  const ts = req.headers["x-agent-timestamp"];
  const sig = req.headers["x-agent-signature"];
  if (!agentId || !ts || !sig) throw new UnauthorizedException("Signature agent manquante");
  const sent = Date.parse(ts);
  if (!Number.isFinite(sent) || Math.abs(Date.now() - sent) > 5 * 60_000) {
    throw new UnauthorizedException("Horodatage agent expiré");
  }
  const row = await query<{
    agent_id: string;
    user_id: string | null;
    module: string;
    public_key: string;
    revoked_at: Date | null;
  }>(`SELECT agent_id, user_id, module, public_key, revoked_at FROM agent WHERE agent_id = $1`, [agentId]);
  const agent = row.rows[0];
  if (!agent || agent.revoked_at) throw new UnauthorizedException("Agent inconnu ou révoqué");
  const jwk = JSON.parse(agent.public_key) as { kty: "EC"; crv: "P-256"; x: string; y: string };
  const key = await importPublicKey(jwk);
  const method = (req as { method?: string }).method ?? "GET";
  const path = ((req as { originalUrl?: string; url?: string }).originalUrl ?? (req as { url?: string }).url ?? "").split("?")[0];
  const ok = await verifyPayload(key, { agentId, method, path, ts }, sig);
  if (!ok) throw new UnauthorizedException("Signature agent invalide");
  req.agent = { agentId: agent.agent_id, userId: agent.user_id, module: agent.module };
  return true;
}

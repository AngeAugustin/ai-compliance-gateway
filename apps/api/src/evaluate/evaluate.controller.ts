import { Body, Controller, Inject, Post, Req } from "@nestjs/common";
import { IncomingFileSchema } from "@acg/shared";
import { EvaluateService } from "./evaluate.service.js";
import { Public } from "../auth/guards.js";
import type { AuthUser } from "../auth/jwt.js";
import { query } from "../db.js";
import { importPublicKey, verifyPayload } from "@acg/shared";
import { clientIp } from "../client-ip.js";

@Controller("/v1/interactions")
export class EvaluateController {
  constructor(@Inject(EvaluateService) private readonly evaluate: EvaluateService) {}

  @Public()
  @Post("/evaluate")
  async evaluateInteraction(
    @Body() body: unknown,
    @Req() req: { user?: AuthUser; headers: Record<string, string | undefined>; ip?: string; socket?: { remoteAddress?: string } },
  ) {
    const actor = await resolveActor(req);
    return this.evaluate.evaluate(body, actor, { clientIp: clientIp(req) });
  }

  @Post("/inspect")
  async inspect(
    @Body()
    body: {
      text: string;
      aiServiceId: string;
      channel?: "browser" | "cli" | "api";
      files?: { fileName: string; mimeType?: string; base64: string }[];
    },
    @Req() req: { user: AuthUser },
  ) {
    const files = (body.files ?? []).map((f) => {
      const parsed = IncomingFileSchema.parse(f);
      return {
        fileName: parsed.fileName,
        mimeType: parsed.mimeType,
        data: Uint8Array.from(Buffer.from(parsed.base64, "base64")),
      };
    });
    return this.evaluate.inspect(body.text, body.aiServiceId, body.channel ?? "api", req.user, files);
  }
}

async function resolveActor(req: { user?: AuthUser; headers: Record<string, string | undefined> }): Promise<{ user?: AuthUser; agentId?: string }> {
  if (req.user) return { user: req.user };
  const agentId = req.headers["x-agent-id"];
  const ts = req.headers["x-agent-timestamp"];
  const sig = req.headers["x-agent-signature"];
  if (agentId && ts && sig) {
    const row = await query<{ public_key: string; revoked_at: Date | null }>(`SELECT public_key, revoked_at FROM agent WHERE agent_id = $1`, [agentId]);
    const agent = row.rows[0];
    if (agent && !agent.revoked_at) {
      const key = await importPublicKey(JSON.parse(agent.public_key));
      const ok = await verifyPayload(key, { agentId, method: "POST", path: "/v1/interactions/evaluate", ts }, sig);
      if (ok) return { agentId };
    }
  }
  return {};
}

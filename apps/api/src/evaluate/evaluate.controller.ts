import { Body, Controller, Inject, Post, Req } from "@nestjs/common";
import { IncomingFileSchema } from "@acg/shared";
import { EvaluateService } from "./evaluate.service.js";
import { AgentAuth } from "../auth/guards.js";
import type { AuthUser } from "../auth/jwt.js";
import { clientIp } from "../client-ip.js";

@Controller("/v1/interactions")
export class EvaluateController {
  constructor(@Inject(EvaluateService) private readonly evaluate: EvaluateService) {}

  /**
   * Événement d'un agent enrôlé. Requête signée obligatoire, corps compris : un événement
   * non signé, falsifié en transit ou rejoué hors fenêtre est rejeté (401), au lieu d'être
   * rattaché par défaut à un utilisateur quelconque.
   */
  @AgentAuth()
  @Post("/evaluate")
  async evaluateInteraction(
    @Body() body: unknown,
    @Req() req: { agent: { agentId: string }; headers: Record<string, string | undefined>; ip?: string; socket?: { remoteAddress?: string } },
  ) {
    return this.evaluate.evaluate(body, { agentId: req.agent.agentId }, { clientIp: clientIp(req) });
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
    const files = decodeIncomingFiles(body.files);
    return this.evaluate.inspect(body.text, body.aiServiceId, body.channel ?? "api", req.user, files);
  }

  /** Extraction texte + OCR (fra+eng) pour l'agent A1/A2 — images analysables côté API. */
  @AgentAuth()
  @Post("/extract-files")
  async extractFiles(@Body() body: { files?: { fileName: string; mimeType?: string; base64: string }[] }) {
    const files = decodeIncomingFiles(body.files);
    const extracted = await this.evaluate.extractAttachmentTexts(files);
    return {
      files: extracted.map((f) => ({
        fileName: f.fileName,
        mimeType: f.mimeType,
        text: f.text,
        extractedTextLength: f.extractedTextLength,
        extractionMethod: f.extractionMethod,
        extractionDegraded: f.extractionDegraded,
        sanitizable: f.sanitizable,
        error: f.error ?? null,
        contentSha256: f.contentSha256,
        sizeBytes: f.sizeBytes,
        attachmentId: f.attachmentId,
      })),
    };
  }
}

function decodeIncomingFiles(files?: { fileName: string; mimeType?: string; base64: string }[]) {
  return (files ?? []).map((f) => {
    const parsed = IncomingFileSchema.parse(f);
    return {
      fileName: parsed.fileName,
      mimeType: parsed.mimeType,
      data: Uint8Array.from(Buffer.from(parsed.base64, "base64")),
    };
  });
}

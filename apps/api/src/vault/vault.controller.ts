import { Body, Controller, Get, Inject, Post, Req } from "@nestjs/common";
import { Roles } from "../auth/guards.js";
import type { AuthUser } from "../auth/jwt.js";
import { clientIp } from "../client-ip.js";
import { EscrowService } from "./escrow.service.js";

@Controller("/v1/vault")
export class VaultController {
  constructor(@Inject(EscrowService) private readonly escrow: EscrowService) {}

  /** Levée d'anonymat d'un événement : DPO + second facteur + motif, accès journalisé. */
  @Roles("DPO")
  @Post("/reveal")
  async reveal(
    @Body() body: { eventId?: string; purpose?: string },
    @Req() req: { user: AuthUser; ip?: string; headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } },
  ) {
    return this.escrow.reveal(String(body.eventId ?? ""), req.user, String(body.purpose ?? ""), clientIp(req));
  }

  /** Registre des accès au séquestre (accordés et refusés). */
  @Roles("DPO", "RSSI")
  @Get("/access-log")
  async accessLog() {
    return this.escrow.accessLog();
  }
}

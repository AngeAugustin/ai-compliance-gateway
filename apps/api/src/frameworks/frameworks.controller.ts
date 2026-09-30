import { Body, Controller, Get, Put, Req } from "@nestjs/common";
import { query } from "../db.js";
import { Roles } from "../auth/guards.js";
import type { AuthUser } from "../auth/jwt.js";

@Controller("/v1/regulatory-frameworks")
export class FrameworksController {
  @Get()
  async list() {
    const res = await query(`SELECT * FROM reference.regulatory_framework ORDER BY name`);
    return res.rows;
  }

  @Roles("RSSI", "ADMIN")
  @Put()
  async activate(@Body() body: { id: string }, @Req() req: { user: AuthUser }) {
    await query(`UPDATE reference.regulatory_framework SET is_active = (id = $1)`, [body.id]);
    await query(`INSERT INTO admin_audit_log(actor_id, action, entity_type, entity_id) VALUES ($1,'ACTIVATE','regulatory_framework',$2)`, [
      req.user.id,
      body.id,
    ]);
    const res = await query(`SELECT * FROM reference.regulatory_framework WHERE id = $1`, [body.id]);
    return res.rows[0];
  }
}

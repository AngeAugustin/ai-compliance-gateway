import {
  ForbiddenException,
  GoneException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import {
  EscrowEnvelopeSchema,
  generateEscrowKeyPair,
  openEscrow,
  randomUuid,
  sealEscrow,
  type EscrowEntry,
  type EscrowEnvelope,
  type PublicKeyJwk,
} from "@acg/shared";
import { decryptValue, encryptValue, importMasterKey } from "@acg/vault";
import { query } from "../db.js";
import { env } from "../env.js";
import type { AuthUser } from "../auth/jwt.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Longueur minimale du motif d'une levée d'anonymat (une phrase, pas « test »). */
export const MIN_PURPOSE_LENGTH = 15;

export interface RevealResult {
  eventId: string;
  entries: EscrowEntry[];
}

/**
 * Séquestre des valeurs masquées (DAT §10.2).
 *
 * - Une paire de clés ECDH P-256 ; la clé privée est stockée chiffrée par la clé maîtresse
 *   du Vault, la clé publique est diffusée aux agents à la synchronisation.
 * - Les agents envoient des enveloppes déjà chiffrées : le serveur les range sans les ouvrir.
 * - Seul un DPO, authentifié avec second facteur, peut lever l'anonymat d'un événement, avec
 *   un motif ; chaque tentative, accordée ou refusée, est inscrite dans vault.access_log.
 */
@Injectable()
export class EscrowService implements OnModuleInit {
  private readonly logger = new Logger(EscrowService.name);
  private masterKey: CryptoKey | null = null;
  private active: { kid: string; publicKey: PublicKeyJwk } | null = null;

  async onModuleInit(): Promise<void> {
    this.masterKey = await importMasterKey(env.vaultMasterKey);
    const current = await query<{ kid: string; public_jwk: PublicKeyJwk }>(
      `SELECT kid, public_jwk FROM vault.escrow_key WHERE retired_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    );
    if (current.rows[0]) {
      this.active = { kid: current.rows[0].kid, publicKey: current.rows[0].public_jwk };
      return;
    }
    const pair = await generateEscrowKeyPair();
    const kid = `esc-${new Date().toISOString().slice(0, 10)}-${randomUuid().slice(0, 8)}`;
    const wrapped = await encryptValue(this.masterKey, JSON.stringify(pair.privateKey));
    await query(`INSERT INTO vault.escrow_key(kid, public_jwk, private_jwk_encrypted) VALUES ($1,$2,$3)`, [
      kid,
      JSON.stringify(pair.publicKey),
      Buffer.from(wrapped),
    ]);
    this.active = { kid, publicKey: pair.publicKey };
    this.logger.log(`Clé de séquestre créée (${kid})`);
  }

  /** Clé publique diffusée aux agents. */
  publicKey(): { kid: string; publicKey: PublicKeyJwk } | null {
    return this.active;
  }

  /** Scellement côté serveur, pour l'inspection depuis le dashboard (le texte y est déjà). */
  async seal(entries: EscrowEntry[], interactionId: string): Promise<EscrowEnvelope | undefined> {
    if (!this.active || entries.length === 0) return undefined;
    return sealEscrow(this.active, entries, interactionId);
  }

  /** Range l'enveloppe telle quelle : le serveur ne la déchiffre pas à la réception. */
  async store(eventId: string, interactionId: string, envelope: EscrowEnvelope): Promise<void> {
    const known = await query(`SELECT 1 FROM vault.escrow_key WHERE kid = $1`, [envelope.kid]);
    if (!known.rows[0]) {
      this.logger.warn(`Enveloppe de séquestre ignorée : clé inconnue ${envelope.kid}`);
      return;
    }
    await query(
      `INSERT INTO vault.escrow(event_id, interaction_id, kid, envelope, expires_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(days => $5))`,
      [eventId, interactionId, envelope.kid, JSON.stringify(envelope), env.vaultRetentionDays],
    );
  }

  async reveal(eventId: string, actor: AuthUser, purpose: string, ip: string | null): Promise<RevealResult> {
    const motive = (purpose ?? "").trim();
    const refuse = async (reason: string, interactionId: string | null = null) => {
      await this.log(actor.id, eventId, interactionId, motive || "(vide)", false, reason, ip);
    };
    // Séparation des rôles : ni l'ADMIN ni le RSSI ne lèvent l'anonymat, seul le DPO.
    if (actor.role !== "DPO") {
      await refuse("rôle non DPO");
      throw new ForbiddenException("Seul le DPO peut lever l'anonymat");
    }
    if (!actor.mfa) {
      await refuse("second facteur absent");
      throw new ForbiddenException("Levée d'anonymat : second facteur requis");
    }
    if (motive.length < MIN_PURPOSE_LENGTH) {
      await refuse("motif insuffisant");
      throw new ForbiddenException(`Motif obligatoire (au moins ${MIN_PURPOSE_LENGTH} caractères)`);
    }
    if (!UUID.test(eventId)) throw new NotFoundException("Événement introuvable");

    const row = await query<{ interaction_id: string; envelope: unknown; expires_at: Date; private_jwk_encrypted: Buffer }>(
      `SELECT e.interaction_id, e.envelope, e.expires_at, k.private_jwk_encrypted
         FROM vault.escrow e JOIN vault.escrow_key k ON k.kid = e.kid
        WHERE e.event_id = $1`,
      [eventId],
    );
    const record = row.rows[0];
    if (!record) {
      await refuse("aucun séquestre");
      throw new NotFoundException("Aucune valeur séquestrée pour cet événement");
    }
    if (record.expires_at.getTime() < Date.now()) {
      await refuse("séquestre expiré", record.interaction_id);
      throw new GoneException("Durée de conservation dépassée : valeurs non restituables");
    }
    // Enveloppe ou clé illisible (ligne altérée, mauvaise clé maîtresse) : la requête du DPO
    // est correcte, c'est la donnée du serveur qui ne l'est pas. La tentative est journalisée
    // comme les autres — une altération du séquestre peut signaler une manipulation.
    let entries: EscrowEntry[];
    try {
      const privateJwk = JSON.parse(await decryptValue(this.masterKey!, new Uint8Array(record.private_jwk_encrypted))) as JsonWebKey;
      entries = await openEscrow(privateJwk, EscrowEnvelopeSchema.parse(record.envelope), record.interaction_id);
    } catch (err) {
      await refuse("séquestre illisible ou altéré", record.interaction_id);
      this.logger.error(`Séquestre illisible pour l'événement ${eventId} : ${err instanceof Error ? err.message : String(err)}`);
      throw new InternalServerErrorException("Séquestre illisible ou altéré : contactez l'administrateur");
    }
    await this.log(actor.id, eventId, record.interaction_id, motive, true, null, ip);
    return { eventId, entries };
  }

  async accessLog(limit = 100) {
    const res = await query(
      `SELECT l.id, l.event_id, l.purpose, l.granted, l.refusal_reason, l.client_ip, l.occurred_at,
              u.display_name AS actor_name, u.email AS actor_email
         FROM vault.access_log l LEFT JOIN app_user u ON u.id = l.actor_id
        ORDER BY l.occurred_at DESC LIMIT $1`,
      [limit],
    );
    return res.rows.map((r) => ({
      id: Number(r.id),
      eventId: r.event_id as string | null,
      purpose: String(r.purpose),
      granted: Boolean(r.granted),
      refusalReason: (r.refusal_reason as string | null) ?? null,
      clientIp: (r.client_ip as string | null) ?? null,
      occurredAt: new Date(r.occurred_at as string).toISOString(),
      actor: (r.actor_name as string | null) ?? (r.actor_email as string | null) ?? null,
    }));
  }

  private async log(
    actorId: string,
    eventId: string,
    interactionId: string | null,
    purpose: string,
    granted: boolean,
    reason: string | null,
    ip: string | null,
  ): Promise<void> {
    await query(
      `INSERT INTO vault.access_log(actor_id, event_id, interaction_id, purpose, granted, refusal_reason, client_ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [actorId, UUID.test(eventId) ? eventId : null, interactionId && UUID.test(interactionId) ? interactionId : null, purpose, granted, reason, ip],
    );
  }
}

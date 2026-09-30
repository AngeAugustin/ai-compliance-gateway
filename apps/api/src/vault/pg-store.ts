import type { VaultRecord, VaultStore } from "@acg/vault";
import { query } from "../db.js";

export class PgVaultStore implements VaultStore {
  async put(record: VaultRecord): Promise<void> {
    await query(
      `INSERT INTO vault.anonymization_mapping(token_id, interaction_id, entity_type, original_value_encrypted, key_version, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (token_id) DO UPDATE SET original_value_encrypted = EXCLUDED.original_value_encrypted, expires_at = EXCLUDED.expires_at`,
      [record.tokenId, record.interactionId, record.entityType, Buffer.from(record.ciphertext), record.keyVersion, record.expiresAt],
    );
  }

  async get(tokenId: string): Promise<VaultRecord | null> {
    const res = await query<{
      token_id: string;
      interaction_id: string;
      entity_type: string;
      original_value_encrypted: Buffer;
      key_version: number;
      expires_at: Date;
    }>(`SELECT token_id, interaction_id, entity_type, original_value_encrypted, key_version, expires_at FROM vault.anonymization_mapping WHERE token_id = $1`, [
      tokenId,
    ]);
    const row = res.rows[0];
    if (!row) return null;
    return {
      tokenId: row.token_id,
      interactionId: row.interaction_id,
      entityType: row.entity_type,
      ciphertext: new Uint8Array(row.original_value_encrypted),
      keyVersion: row.key_version,
      expiresAt: row.expires_at,
    };
  }
}

export { decryptValue, encodeKeyMaterial, encryptValue, importMasterKey } from "./crypto.js";
import { decryptValue, encryptValue } from "./crypto.js";

export interface VaultRecord {
  tokenId: string;
  interactionId: string;
  entityType: string;
  ciphertext: Uint8Array;
  keyVersion: number;
  expiresAt: Date;
}

export interface VaultStore {
  put(record: VaultRecord): Promise<void>;
  get(tokenId: string): Promise<VaultRecord | null>;
}

export class MemoryVaultStore implements VaultStore {
  private readonly map = new Map<string, VaultRecord>();
  async put(record: VaultRecord): Promise<void> {
    this.map.set(record.tokenId, record);
  }
  async get(tokenId: string): Promise<VaultRecord | null> {
    return this.map.get(tokenId) ?? null;
  }
}

export class AnonymizationVault {
  constructor(
    private readonly key: CryptoKey,
    private readonly store: VaultStore,
    private readonly ttlHours = 24,
  ) {}

  async storeMapping(interactionId: string, tokenId: string, entityType: string, original: string): Promise<void> {
    const ciphertext = await encryptValue(this.key, original);
    const expiresAt = new Date(Date.now() + this.ttlHours * 3600_000);
    await this.store.put({ tokenId, interactionId, entityType, ciphertext, keyVersion: 1, expiresAt });
  }

  async reveal(tokenId: string): Promise<string | null> {
    const record = await this.store.get(tokenId);
    if (!record) return null;
    if (record.expiresAt.getTime() < Date.now()) return null;
    return decryptValue(this.key, record.ciphertext);
  }
}

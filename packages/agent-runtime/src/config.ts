import type { AgentModule, AgentSyncResponse } from "@acg/shared";

export interface AgentPersistedConfig {
  apiUrl: string;
  agentId: string | null;
  module: AgentModule;
  userId: string | null;
  enrollmentToken: string | null;
  publicKey: { kty: "EC"; crv: "P-256"; x: string; y: string } | null;
  privateKey: JsonWebKey | null;
  heartbeatIntervalSeconds: number;
  syncIntervalSeconds: number;
  lastPolicyVersion: string | null;
  /** Dernière synchro : l'agent décide hors-ligne avec les politiques du serveur. */
  lastSnapshot: AgentSyncResponse | null;
  /** Dernier numéro de séquence heartbeat (évite les collisions A2 intercept / démon). */
  lastSequence: number;
}

export const DEFAULT_AGENT_CONFIG: AgentPersistedConfig = {
  apiUrl: "http://localhost:4000",
  agentId: null,
  module: "A1",
  userId: null,
  enrollmentToken: null,
  publicKey: null,
  privateKey: null,
  heartbeatIntervalSeconds: 60,
  syncIntervalSeconds: 300,
  lastPolicyVersion: null,
  lastSnapshot: null,
  lastSequence: 0,
};

export type ConfigStore = {
  load(): Promise<AgentPersistedConfig>;
  save(config: AgentPersistedConfig): Promise<void>;
};

export function memoryConfigStore(initial: Partial<AgentPersistedConfig> = {}): ConfigStore {
  let current: AgentPersistedConfig = { ...DEFAULT_AGENT_CONFIG, ...initial };
  return {
    async load() {
      return { ...current };
    },
    async save(config) {
      current = { ...config };
    },
  };
}

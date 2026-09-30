import {
  EnrollAgentResponseSchema,
  type AgentSyncResponse,
  type EnrollAgentRequest,
  type EnrollAgentResponse,
  type EvaluateInteractionRequest,
  type EvaluateInteractionResponse,
  type HeartbeatPayload,
  type HeartbeatResponse,
  type IntegrityReport,
} from "@acg/shared";
import { signPayload } from "@acg/shared";

export class AgentApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AgentApiError";
  }
}

export class GatewayClient {
  constructor(
    private apiUrl: string,
    private getPrivateKey: () => Promise<CryptoKey | null>,
    private getAgentId: () => string | null,
  ) {}

  setApiUrl(url: string): void {
    this.apiUrl = url.replace(/\/$/, "");
  }

  async enroll(body: EnrollAgentRequest): Promise<EnrollAgentResponse> {
    const res = await this.request("POST", "/v1/agents/enroll", body, false);
    return EnrollAgentResponseSchema.parse(res);
  }

  async sync(): Promise<AgentSyncResponse> {
    return (await this.request("GET", "/v1/agents/sync", undefined, true)) as AgentSyncResponse;
  }

  async heartbeat(payload: HeartbeatPayload): Promise<HeartbeatResponse> {
    const key = await this.getPrivateKey();
    if (!key) throw new AgentApiError("clé agent absente", 401);
    const signature = await signPayload(key, payload);
    return (await this.request("POST", "/v1/agents/heartbeat", { payload, signature }, true)) as HeartbeatResponse;
  }

  async evaluate(body: EvaluateInteractionRequest): Promise<EvaluateInteractionResponse> {
    return (await this.request("POST", "/v1/interactions/evaluate", body, true)) as EvaluateInteractionResponse;
  }

  private async request(method: string, path: string, body: unknown, signed: boolean): Promise<unknown> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const agentId = this.getAgentId();
    if (agentId) headers["X-Agent-Id"] = agentId;
    if (signed) {
      const key = await this.getPrivateKey();
      if (key && agentId) {
        const ts = new Date().toISOString();
        headers["X-Agent-Timestamp"] = ts;
        headers["X-Agent-Signature"] = await signPayload(key, { agentId, method, path, ts });
      }
    }
    const res = await fetch(`${this.apiUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new AgentApiError(`${method} ${path} → ${res.status} ${text}`, res.status);
    }
    if (res.status === 204) return null;
    return res.json();
  }
}

export function emptyIntegrity(localDetectionAvailable: boolean, layers: string[]): IntegrityReport {
  return {
    agentBundleSha256: null,
    models: [],
    localDetectionAvailable,
    layersAvailable: layers,
  };
}

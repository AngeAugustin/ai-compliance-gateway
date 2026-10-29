import { sealEscrow, type AgentSyncResponse, type EscrowEnvelope } from "@acg/shared";
import type { LocalDecision } from "./pipeline.js";

/**
 * Enveloppe de séquestre d'une interaction masquée : les correspondances jeton → valeur
 * de cette interaction, chiffrées avec la clé publique du serveur. C'est la seule forme
 * sous laquelle une valeur masquée quitte le poste (transit, file hors ligne sur disque).
 * Rien si l'interaction n'est pas masquée ou si le serveur n'a pas publié de clé.
 */
export async function escrowFor(
  decision: LocalDecision,
  escrowKey: AgentSyncResponse["escrowKey"],
): Promise<EscrowEnvelope | undefined> {
  if (!escrowKey || decision.action !== "MASK") return undefined;
  const used = new Set(decision.decision.maskedTokens);
  const entries = decision.tokenBindings
    .filter((b) => used.has(b.token))
    .map((b) => ({ token: b.token, entityType: b.entityType, value: b.value }));
  if (entries.length === 0) return undefined;
  return sealEscrow(escrowKey, entries, decision.interactionId);
}

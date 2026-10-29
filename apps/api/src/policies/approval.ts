import type { PolicyAction } from "@acg/shared";

export type ChangeOperation = "CREATE" | "UPDATE" | "DELETE";

/**
 * Règle des quatre yeux : toute création, modification ou suppression qui touche une
 * règle BLOCK (avant ou après le changement) doit être approuvée par une autre personne
 * que son auteur. Une règle BLOCK coupe l'accès des agents à un service d'IA : une erreur
 * ou un abus d'un seul administrateur ne doit pas suffire à la poser ni à la retirer.
 */
export function requiresApproval(operation: ChangeOperation, current: { action: PolicyAction } | null, proposed: { action?: PolicyAction | null } | null): boolean {
  if (operation === "CREATE") return proposed?.action === "BLOCK";
  if (operation === "DELETE") return current?.action === "BLOCK";
  return current?.action === "BLOCK" || proposed?.action === "BLOCK";
}

export type ApprovalVerdict = { ok: true } | { ok: false; status: 403 | 409; reason: string };

export function canApprove(request: { requestedBy: string; status: string; baseVersion: number | null }, approverId: string, currentVersion: number | null): ApprovalVerdict {
  if (request.status !== "pending") return { ok: false, status: 409, reason: "Demande déjà traitée" };
  if (request.requestedBy === approverId) {
    return { ok: false, status: 403, reason: "Double validation : l'auteur d'une demande ne peut pas l'approuver" };
  }
  // La règle a changé depuis la demande : approuver écraserait une version que l'approbateur n'a pas vue.
  if (request.baseVersion !== null && request.baseVersion !== currentVersion) {
    return { ok: false, status: 409, reason: "La règle a été modifiée depuis la demande : soumettre une nouvelle demande" };
  }
  return { ok: true };
}

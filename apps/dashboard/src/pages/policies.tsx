import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { describeConditionExpr } from "@acg/shared";
import { api } from "../api";
import { ConfirmModal } from "../confirm-modal";
import { useToast } from "../toast";
import { PageHeader, RiskBadge } from "../ui";
import type { PendingResult, Policy } from "./policy-form";

type ChangeRequest = {
  id: string;
  policyId: string | null;
  policyName: string | null;
  policyAction: string | null;
  operation: "CREATE" | "UPDATE" | "DELETE";
  payload: Record<string, unknown> | null;
  requestedBy: string;
  requestedByEmail: string | null;
  requestedAt: string | null;
};

const OPERATION_LABELS: Record<ChangeRequest["operation"], string> = {
  CREATE: "Création",
  UPDATE: "Modification",
  DELETE: "Suppression",
};

function describeChange(c: ChangeRequest): string {
  if (c.operation === "DELETE") return `Suppression de la règle (action actuelle : ${c.policyAction ?? "—"}).`;
  const p = c.payload ?? {};
  const parts: string[] = [];
  if (typeof p.action === "string") parts.push(c.policyAction && c.policyAction !== p.action ? `action ${c.policyAction} → ${p.action}` : `action ${p.action}`);
  if (typeof p.enabled === "boolean") parts.push(p.enabled ? "activée" : "désactivée");
  if (typeof p.priority === "number") parts.push(`priorité ${p.priority}`);
  if (typeof p.conditionExpr === "string") parts.push(describeConditionExpr(p.conditionExpr) ?? p.conditionExpr);
  return parts.join(" · ") || "Modification des métadonnées.";
}

export function PoliciesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState<Policy[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Policy | null>(null);
  const [busy, setBusy] = useState(false);
  const [changes, setChanges] = useState<ChangeRequest[]>([]);
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    void api<{ id: string }>("/v1/auth/me").then((u) => setMe(u.id)).catch(() => undefined);
  }, []);

  async function refresh() {
    const [policies, pendingChanges] = await Promise.all([
      api<Policy[]>("/v1/policies"),
      api<ChangeRequest[]>("/v1/policies/changes?status=pending"),
    ]);
    setItems(policies);
    setChanges(pendingChanges);
  }

  async function review(change: ChangeRequest, verdict: "approve" | "reject") {
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/policies/changes/${encodeURIComponent(change.id)}/${verdict}`, { method: "POST", body: "{}" });
      toast.success(verdict === "approve" ? "Changement approuvé et appliqué." : "Demande rejetée.");
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh().catch((e: Error) => setError(e.message));
  }, []);

  async function confirmDelete() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<PendingResult>(`/v1/policies/${encodeURIComponent(pending.id)}`, { method: "DELETE" });
      toast.success(res.pendingApproval ? `${pending.name} : suppression soumise à double validation.` : `${pending.name} supprimée.`);
      setPending(null);
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        kicker="Règles"
        title="Politiques"
        lead="Décrivez la situation avec des critères, puis choisissez la décision. La première règle vraie gagne (priorité la plus basse d'abord)."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => navigate("/policies/nouveau")}>
            Nouvelle règle
          </button>
        }
      />

      {error ? (
        <p className="notice-err" role="alert">
          {error}
        </p>
      ) : null}

      {changes.length > 0 ? (
        <section className="panel" style={{ padding: 16, marginBottom: 16 }}>
          <p className="panel-kicker font-mono">Double validation</p>
          <h2 style={{ margin: "2px 0 8px" }}>Changements en attente ({changes.length})</h2>
          <p style={{ color: "var(--fog)", fontSize: 13, margin: "0 0 12px" }}>
            Tout changement touchant une règle BLOCK doit être approuvé par un autre RSSI ou administrateur que son auteur.
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            {changes.map((c) => {
              const own = me !== null && c.requestedBy === me;
              const name = c.policyName ?? (c.payload?.name as string | undefined) ?? "Nouvelle règle";
              return (
                <article key={c.id} style={{ borderTop: "1px solid var(--line, rgba(127,127,127,.2))", paddingTop: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <strong>
                      {OPERATION_LABELS[c.operation]} · {name}
                    </strong>
                    <span className="font-mono" style={{ fontSize: 11, color: "var(--fog)" }}>
                      {c.requestedByEmail ?? c.requestedBy} · {c.requestedAt ? new Date(c.requestedAt).toLocaleString("fr-FR") : ""}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, margin: "4px 0 8px" }}>{describeChange(c)}</p>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy || own}
                      title={own ? "Vous êtes l'auteur : un autre approbateur est requis" : undefined}
                      onClick={() => void review(c, "approve")}
                    >
                      Approuver
                    </button>
                    <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void review(c, "reject")}>
                      {own ? "Retirer" : "Rejeter"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="policy-list">
        {items.length === 0 ? (
          <p style={{ color: "var(--fog)" }}>Aucune politique. Créez la première règle.</p>
        ) : (
          items.map((p) => (
            <article key={p.id} className="panel" style={{ opacity: p.enabled ? 1 : 0.55, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <strong>{p.name}</strong>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="font-mono" style={{ fontSize: 11, color: "var(--fog)" }}>
                    prio {p.priority} · v{p.version}
                  </span>
                  <RiskBadge value={p.action} />
                </div>
              </div>
              {p.description ? <p style={{ color: "var(--fog)", fontSize: 13, margin: "6px 0 4px" }}>{p.description}</p> : null}
              <p style={{ fontSize: 13, margin: "0 0 12px", lineHeight: 1.45 }}>
                {describeConditionExpr(p.conditionExpr) ?? p.conditionExpr}
              </p>
              <div className="row-actions">
                <button type="button" className="btn btn-ghost" onClick={() => navigate(`/policies/${p.id}/modifier`)}>
                  Modifier
                </button>
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setPending(p)}>
                  Supprimer
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      <ConfirmModal
        open={pending != null}
        title="Supprimer cette règle ?"
        description={
          pending
            ? `La politique « ${pending.name} » sera définitivement supprimée. Les agents ne l'appliqueront plus après le prochain sync.`
            : ""
        }
        confirmLabel="Supprimer"
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => !busy && setPending(null)}
      />
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { describeConditionExpr } from "@acg/shared";
import { api } from "../api";
import { ConfirmModal } from "../confirm-modal";
import { useToast } from "../toast";
import { PageHeader, RiskBadge } from "../ui";
import type { Policy } from "./policy-form";

export function PoliciesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState<Policy[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Policy | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setItems(await api<Policy[]>("/v1/policies"));
  }

  useEffect(() => {
    void refresh().catch((e: Error) => setError(e.message));
  }, []);

  async function confirmDelete() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/policies/${encodeURIComponent(pending.id)}`, { method: "DELETE" });
      toast.success(`${pending.name} supprimée.`);
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

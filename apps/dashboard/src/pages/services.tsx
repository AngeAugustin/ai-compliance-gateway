import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { ConfirmModal } from "../confirm-modal";
import { usePagination } from "../pagination";
import { useToast } from "../toast";
import { NumberedPagination, PageHeader, RiskBadge } from "../ui";
import type { AiService } from "./service-form";

export function ServicesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState<AiService[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<AiService | null>(null);
  const [busy, setBusy] = useState(false);
  const { page, setPage, pageCount, pageItems, total, from, to } = usePagination(items);

  async function refresh() {
    setItems(await api<AiService[]>("/v1/ai-services"));
  }

  useEffect(() => {
    void refresh().catch((e: Error) => setError(e.message));
  }, []);

  async function confirmDelete() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/ai-services/${encodeURIComponent(pending.id)}`, { method: "DELETE" });
      toast.success(`${pending.name} retiré du catalogue.`);
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
        kicker="Catalogue"
        title="Services IA"
        lead="Domaines web (agent A1) et commandes CLI (agent A2). La région d'hébergement alimente le facteur transfrontalier."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => navigate("/services/nouveau")}>
            Nouveau service
          </button>
        }
      />

      {error ? (
        <p className="notice-err" role="alert">
          {error}
        </p>
      ) : null}

      <div className="table-panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Région</th>
                <th>Risque</th>
                <th>Couverture</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ color: "var(--fog)" }}>
                    Aucun service.
                  </td>
                </tr>
              ) : (
                pageItems.map((s) => (
                  <tr key={s.id} style={{ opacity: s.enabled ? 1 : 0.55 }}>
                    <td>
                      <strong>{s.name}</strong>
                      <div className="font-mono" style={{ fontSize: 11, color: "var(--fog)" }}>
                        {s.id}
                      </div>
                    </td>
                    <td>
                      <span className="font-mono">{s.hostingRegion}</span>
                    </td>
                    <td>
                      <RiskBadge value={s.riskBaseline >= 40 ? "high" : s.riskBaseline >= 25 ? "moderate" : "low"} />
                      <span className="font-mono" style={{ marginLeft: 8 }}>
                        {s.riskBaseline}
                      </span>
                    </td>
                    <td className="font-mono" style={{ color: "var(--fog)", fontSize: 11 }}>
                      {s.domains.length} web · {s.cliCommands.length} cli
                      {!s.enabled ? " · off" : ""}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="btn btn-ghost" onClick={() => navigate(`/services/${encodeURIComponent(s.id)}/modifier`)}>
                          Modifier
                        </button>
                        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setPending(s)}>
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <NumberedPagination page={page} pageCount={pageCount} total={total} from={from} to={to} onPageChange={setPage} />
      </div>

      <ConfirmModal
        open={pending != null}
        title="Supprimer ce service ?"
        description={
          pending
            ? `« ${pending.name} » (${pending.id}) sera retiré du catalogue. Les agents ne le surveilleront plus après le prochain sync.`
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

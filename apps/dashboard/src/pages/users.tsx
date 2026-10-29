import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { ConfirmModal } from "../confirm-modal";
import { usePagination } from "../pagination";
import { useToast } from "../toast";
import { NumberedPagination, PageHeader, RiskBadge } from "../ui";
import { ROLE_LABELS, type UserRecord } from "./user-form";

export function UsersPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState<UserRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<UserRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserRecord | null>(null);
  const { page, setPage, pageCount, pageItems, total, from, to } = usePagination(items);

  async function refresh() {
    setItems(await api<UserRecord[]>("/v1/users"));
  }

  useEffect(() => {
    void refresh().catch((e: Error) => setError(e.message));
  }, []);

  async function confirmDeactivate() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/users/${encodeURIComponent(pending.id)}`, { method: "DELETE" });
      toast.success(`${pending.displayName} désactivé.`);
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

  async function confirmResetMfa() {
    if (!resetTarget) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/auth/mfa/reset/${encodeURIComponent(resetTarget.id)}`, { method: "POST" });
      toast.success(`Second facteur de ${resetTarget.displayName} réinitialisé.`);
      setResetTarget(null);
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
        kicker="Administration"
        title="Utilisateurs"
        lead="Créez les collaborateurs avant d'émettre un jeton d'agent. Désactiver un compte conserve l'historique et les agents déjà enrôlés."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => navigate("/users/nouveau")}>
            Nouvel utilisateur
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
                <th>Nom</th>
                <th>E-mail</th>
                <th>Direction</th>
                <th>Rôle</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ color: "var(--fog)" }}>
                    Aucun utilisateur.
                  </td>
                </tr>
              ) : (
                pageItems.map((u) => (
                  <tr key={u.id} style={{ opacity: u.isActive ? 1 : 0.55 }}>
                    <td>{u.displayName}</td>
                    <td className="font-mono" style={{ fontSize: 12 }}>
                      {u.email}
                    </td>
                    <td>{u.department}</td>
                    <td>{ROLE_LABELS[u.role]}</td>
                    <td>
                      <RiskBadge value={u.isActive ? "ALLOW" : "BLOCK"} />
                      <span style={{ marginLeft: 8 }}>{u.isActive ? "Actif" : "Inactif"}</span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="btn btn-ghost" onClick={() => navigate(`/users/${u.id}/modifier`)}>
                          Modifier
                        </button>
                        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setResetTarget(u)}>
                          Réinitialiser MFA
                        </button>
                        {u.isActive ? (
                          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setPending(u)}>
                            Désactiver
                          </button>
                        ) : null}
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
        title="Désactiver cet utilisateur ?"
        description={
          pending
            ? `Le compte « ${pending.displayName} » (${pending.email}) sera désactivé. L'historique et les agents déjà enrôlés sont conservés.`
            : ""
        }
        confirmLabel="Désactiver"
        busy={busy}
        onConfirm={() => void confirmDeactivate()}
        onCancel={() => !busy && setPending(null)}
      />

      <ConfirmModal
        open={resetTarget != null}
        title="Réinitialiser le second facteur ?"
        description={
          resetTarget
            ? `Le second facteur de « ${resetTarget.displayName} » sera supprimé et ses sessions révoquées. À la prochaine connexion, il devra enrôler une nouvelle application d'authentification.`
            : ""
        }
        confirmLabel="Réinitialiser"
        danger
        busy={busy}
        onConfirm={() => void confirmResetMfa()}
        onCancel={() => !busy && setResetTarget(null)}
      />
    </div>
  );
}

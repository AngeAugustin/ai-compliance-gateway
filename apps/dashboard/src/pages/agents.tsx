import { useEffect, useState } from "react";
import { api } from "../api";
import { ConfirmModal } from "../confirm-modal";
import { usePagination } from "../pagination";
import { useToast } from "../toast";
import { NumberedPagination, PageHeader, RiskBadge } from "../ui";

type Agent = {
  agent_id: string;
  module: string;
  hostname: string | null;
  last_ip: string | null;
  integrity_status: string;
  last_heartbeat_at: string | null;
  display_name: string | null;
  department: string | null;
};

type Assignee = { id: string; email: string; displayName: string; department: string; role: string };

type IssuedToken = {
  id: string;
  token: string;
  apiUrl: string;
  command: string | null;
  assignedTo: string | null;
  assignedName: string | null;
};

type TokenRow = {
  id: string;
  assignedTo: string | null;
  assignedName: string | null;
  expiresAt: string;
  status: "active" | "partial" | "used" | "expired" | "revoked";
  canRevoke: boolean;
};

type TabId = "codes" | "postes";

const STATUS_LABEL: Record<TokenRow["status"], string> = {
  active: "Valide",
  partial: "En cours",
  used: "Utilisé",
  expired: "Expiré",
  revoked: "Supprimé",
};

const STATUS_BADGE: Record<TokenRow["status"], string> = {
  active: "ALLOW",
  partial: "WARN",
  used: "MASK",
  expired: "BLOCK",
  revoked: "BLOCK",
};

export function AgentsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<TabId>("codes");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [issued, setIssued] = useState<IssuedToken | null>(null);
  const [userId, setUserId] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const openTokens = tokens.filter((t) => t.canRevoke);
  const tokensPager = usePagination(openTokens, 10, openTokens.length);
  const agentsPager = usePagination(agents);

  async function loadAll() {
    const [people, tokenList, agentList] = await Promise.all([
      api<Assignee[]>("/v1/agents/assignees"),
      api<TokenRow[]>("/v1/agents/enrollment-tokens"),
      api<Agent[]>("/v1/agents"),
    ]);
    setAssignees(people);
    setTokens(tokenList);
    setAgents(agentList);
    setUserId((current) => {
      if (current && people.some((p) => p.id === current)) return current;
      return people.find((p) => p.role === "USER")?.id ?? people[0]?.id ?? "";
    });
  }

  useEffect(() => {
    void loadAll().catch((e: Error) => setError(e.message));
  }, []);

  async function createToken() {
    if (!userId) {
      setError("Choisissez d'abord une personne.");
      return;
    }
    setBusy(true);
    setError(null);
    setPendingDeleteId(null);
    setTab("codes");
    try {
      const res = await api<IssuedToken>("/v1/agents/enrollment-tokens", {
        method: "POST",
        body: JSON.stringify({ modules: ["A1", "A2"], ttlMinutes: 120, userId }),
      });
      setIssued(res);
      toast.success(`Code créé pour ${res.assignedName ?? "l'utilisateur"}.`);
      await loadAll();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteToken() {
    if (!pendingDeleteId) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/agents/enrollment-tokens/${encodeURIComponent(pendingDeleteId)}`, { method: "DELETE" });
      if (issued?.id === pendingDeleteId) setIssued(null);
      setPendingDeleteId(null);
      toast.success("Code supprimé.");
      await loadAll();
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
        title="Agents"
        lead="Codes d'installation, ou postes déjà équipés de l'extension et du terminal."
      />

      <div className="tabs" role="tablist" aria-label="Sections agents">
        <button
          type="button"
          role="tab"
          id="tab-codes"
          aria-selected={tab === "codes"}
          aria-controls="panel-codes"
          className={`tabs-btn${tab === "codes" ? " is-active" : ""}`}
          onClick={() => setTab("codes")}
        >
          Codes d'installation
          <span className="tabs-count font-mono">{openTokens.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="tab-postes"
          aria-selected={tab === "postes"}
          aria-controls="panel-postes"
          className={`tabs-btn${tab === "postes" ? " is-active" : ""}`}
          onClick={() => setTab("postes")}
        >
          Postes installés
          <span className="tabs-count font-mono">{agents.length}</span>
        </button>
      </div>

      {error ? (
        <p className="notice-err" role="alert">
          {error}
        </p>
      ) : null}

      {tab === "codes" ? (
        <div id="panel-codes" role="tabpanel" aria-labelledby="tab-codes">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
            <label className="field-label" htmlFor="agent-person" style={{ margin: 0 }}>
              Personne
            </label>
            <select
              id="agent-person"
              className="input"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              style={{ minWidth: 240, width: "auto" }}
              disabled={assignees.length === 0}
            >
              {assignees.length === 0 ? <option value="">Chargement…</option> : null}
              {assignees.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName} — {u.department}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-primary" disabled={busy || !userId} onClick={() => void createToken()}>
              {busy ? "Création…" : "Créer un code"}
            </button>
          </div>

          {issued ? (
            <div className="panel" style={{ marginBottom: 16, borderColor: "var(--booth)" }}>
              <p className="field-label" style={{ marginTop: 0 }}>
                Nouveau code pour {issued.assignedName}
              </p>
              <p className="font-mono" style={{ fontSize: 14, wordBreak: "break-all", margin: "0 0 12px" }}>
                {issued.token}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    void navigator.clipboard.writeText(issued.token).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1600);
                    });
                  }}
                >
                  {copied ? "Copié" : "Copier"}
                </button>
                {issued.command ? (
                  <button type="button" className="btn btn-ghost" onClick={() => void navigator.clipboard.writeText(issued.command!)}>
                    Copier commande terminal
                  </button>
                ) : null}
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setPendingDeleteId(issued.id)}>
                  Supprimer
                </button>
              </div>
            </div>
          ) : null}

          <div className="table-panel">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Personne</th>
                    <th>État</th>
                    <th>Expire le</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tokensPager.pageItems.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ color: "var(--fog)" }}>
                        Aucun code encore utilisable. Cliquez sur « Créer un code ».
                      </td>
                    </tr>
                  ) : (
                    tokensPager.pageItems.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <div>{t.assignedName ?? "—"}</div>
                          <div className="font-mono" style={{ fontSize: 11, color: "var(--fog)" }}>
                            {t.assignedTo}
                          </div>
                        </td>
                        <td>
                          <RiskBadge value={STATUS_BADGE[t.status]} />
                          <span style={{ marginLeft: 8 }}>{STATUS_LABEL[t.status]}</span>
                        </td>
                        <td className="font-mono" style={{ fontSize: 12 }}>
                          {new Date(t.expiresAt).toLocaleString("fr-FR")}
                        </td>
                        <td>
                          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setPendingDeleteId(t.id)}>
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <NumberedPagination
              page={tokensPager.page}
              pageCount={tokensPager.pageCount}
              total={tokensPager.total}
              from={tokensPager.from}
              to={tokensPager.to}
              onPageChange={tokensPager.setPage}
            />
          </div>
        </div>
      ) : (
        <div id="panel-postes" role="tabpanel" aria-labelledby="tab-postes">
          <p style={{ color: "var(--fog)", fontSize: 13, margin: "0 0 12px" }}>
            Extension ou terminal déjà installés : machine, personne liée, intégrité et dernier contact avec le serveur.
          </p>
          <div className="table-panel">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Poste</th>
                    <th>Adresse IP</th>
                    <th>Personne</th>
                    <th>État</th>
                    <th>Dernier signal</th>
                  </tr>
                </thead>
                <tbody>
                  {agentsPager.pageItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ color: "var(--fog)" }}>
                        Aucune installation. Créez un code dans l'onglet précédent, puis enrôlez l'extension ou le terminal.
                      </td>
                    </tr>
                  ) : (
                    agentsPager.pageItems.map((a) => (
                      <tr key={a.agent_id}>
                        <td>{a.module === "A1" ? "Extension" : a.module === "A2" ? "Terminal" : a.module}</td>
                        <td>{a.hostname ?? "—"}</td>
                        <td className="font-mono" style={{ fontSize: 12 }}>
                          {a.last_ip ?? "—"}
                        </td>
                        <td>
                          {a.display_name} · {a.department}
                        </td>
                        <td>
                          <RiskBadge value={a.integrity_status === "ok" ? "ALLOW" : a.integrity_status === "missing" ? "BLOCK" : "WARN"} />
                          <span style={{ marginLeft: 8 }}>{a.integrity_status}</span>
                        </td>
                        <td className="font-mono" style={{ fontSize: 12 }}>
                          {a.last_heartbeat_at ? new Date(a.last_heartbeat_at).toLocaleString("fr-FR") : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <NumberedPagination
              page={agentsPager.page}
              pageCount={agentsPager.pageCount}
              total={agentsPager.total}
              from={agentsPager.from}
              to={agentsPager.to}
              onPageChange={agentsPager.setPage}
            />
          </div>
        </div>
      )}

      <ConfirmModal
        open={pendingDeleteId != null}
        title="Supprimer ce code ?"
        description={
          pendingDeleteId
            ? `Le code d'installation${
                issued?.id === pendingDeleteId && issued.assignedName
                  ? ` pour ${issued.assignedName}`
                  : tokens.find((t) => t.id === pendingDeleteId)?.assignedName
                    ? ` pour ${tokens.find((t) => t.id === pendingDeleteId)?.assignedName}`
                    : ""
              } sera révoqué et ne pourra plus servir à l'enrôlement.`
            : ""
        }
        confirmLabel="Supprimer"
        busy={busy}
        onConfirm={() => void confirmDeleteToken()}
        onCancel={() => !busy && setPendingDeleteId(null)}
      />
    </div>
  );
}

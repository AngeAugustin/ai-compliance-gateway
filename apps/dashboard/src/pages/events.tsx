import { useEffect, useMemo, useState } from "react";
import type { SecurityEvent } from "@acg/shared";
import { api } from "../api";
import { usePagination } from "../pagination";
import { NumberedPagination, PageHeader, RiskBadge } from "../ui";

const ACTIONS = ["ALL", "ALLOW", "WARN", "MASK", "BLOCK"] as const;

const CHANNEL_LABEL: Record<string, string> = {
  browser: "Navigateur",
  cli: "Terminal",
  api: "API",
};

const BAND_LABEL: Record<string, string> = {
  low: "Faible",
  moderate: "Modéré",
  high: "Élevé",
  critical: "Critique",
};

const FACTOR_LABEL: Record<string, string> = {
  entity_sensitivity: "Sensibilité des entités",
  quasi_identifier_combination: "Quasi-identifiants",
  hosting_location: "Lieu d'hébergement",
  organizational_context: "Contexte organisationnel",
};

function shortHash(value: string | null | undefined, size = 10): string {
  if (!value) return "—";
  return `${value.slice(0, size)}…`;
}

function DetailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17ZM12 11v5.5M12 8.2h.01"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="drawer-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function diverges(e: SecurityEvent): boolean {
  return e.serverDecision != null && e.serverDecision.action !== e.action;
}

const MIN_PURPOSE_LENGTH = 15;

/**
 * Levée d'anonymat : réservée au DPO connecté avec second facteur, sur motif écrit.
 * Chaque tentative est journalisée côté serveur ; les valeurs ne sont jamais conservées ici.
 */
function RevealSection({ eventId, role }: { eventId: string; role: string | null }) {
  const [open, setOpen] = useState(false);
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<{ token: string; entityType: string; value: string }[] | null>(null);

  async function reveal() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ entries: { token: string; entityType: string; value: string }[] }>("/v1/vault/reveal", {
        method: "POST",
        body: JSON.stringify({ eventId, purpose: purpose.trim() }),
      });
      setEntries(res.entries);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="drawer-section">
      <h3>Valeurs séquestrées</h3>
      {entries ? (
        <ul className="drawer-list">
          {entries.map((x) => (
            <li key={x.token}>
              <span className="font-mono" style={{ fontSize: 12 }}>
                {x.token} · {x.entityType}
              </span>
              <span className="font-mono">{x.value}</span>
            </li>
          ))}
        </ul>
      ) : role !== "DPO" ? (
        <p className="drawer-empty">Valeurs masquées chiffrées sous séquestre. Seul le DPO peut lever l'anonymat, sur motif.</p>
      ) : open ? (
        <div style={{ display: "grid", gap: 8 }}>
          <label className="field-label" htmlFor="reveal-purpose">
            Motif de la levée d'anonymat (journalisé)
          </label>
          <textarea
            id="reveal-purpose"
            className="input"
            rows={3}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="Ex. : réquisition judiciaire n° …, demande d'exercice de droits de la personne concernée…"
          />
          <div className="row-actions">
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy || purpose.trim().length < MIN_PURPOSE_LENGTH}
              onClick={() => void reveal()}
            >
              Lever l'anonymat
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setOpen(false)}>
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
          Lever l'anonymat…
        </button>
      )}
      {error ? <p className="notice-err">{error}</p> : null}
    </section>
  );
}

export function EventsPage() {
  const [items, setItems] = useState<SecurityEvent[]>([]);
  const [filter, setFilter] = useState<(typeof ACTIONS)[number]>("ALL");
  const [selected, setSelected] = useState<SecurityEvent | null>(null);

  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    void api<{ items: SecurityEvent[] }>("/v1/events?limit=100").then((r) => setItems(r.items));
    void api<{ role: string }>("/v1/auth/me").then((u) => setRole(u.role)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selected) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const visible = useMemo(() => (filter === "ALL" ? items : items.filter((e) => e.action === filter)), [items, filter]);
  const { page, setPage, pageCount, pageItems, total, from, to } = usePagination(visible, 10, filter);

  return (
    <div>
      <PageHeader
        kicker="Audit"
        title="Journal d'audit"
        lead="Décisions sans contenu en clair. Ouvrez une ligne pour le détail complet."
      />
      <div className="filter-row">
        {ACTIONS.map((a) => (
          <button key={a} type="button" className={`chip ${filter === a ? "is-on" : ""}`} onClick={() => setFilter(a)}>
            {a === "ALL" ? "Toutes" : a}
          </button>
        ))}
      </div>
      <div className="table-panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Heure</th>
                <th>Action</th>
                <th>Score</th>
                <th>Canal</th>
                <th>Service</th>
                <th>Direction</th>
                <th>IP</th>
                <th>Entités</th>
                <th aria-label="Détails" />
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ color: "var(--fog)" }}>
                    Aucun événement pour ce filtre.
                  </td>
                </tr>
              ) : (
                pageItems.map((e) => (
                  <tr key={e.eventId} className={selected?.eventId === e.eventId ? "is-selected" : undefined}>
                    <td className="font-mono">{new Date(e.occurredAt).toLocaleString("fr-FR")}</td>
                    <td>
                      <RiskBadge value={e.action} />
                      {diverges(e) ? (
                        <span
                          className="font-mono"
                          title={`Le serveur aurait décidé ${e.serverDecision!.action}`}
                          style={{ marginLeft: 6, fontSize: 11, color: "var(--warn, #d97706)" }}
                        >
                          ≠ {e.serverDecision!.action}
                        </span>
                      ) : null}
                    </td>
                    <td className="font-mono">
                      {e.riskScore}
                      <span style={{ color: "var(--fog)" }}> · {BAND_LABEL[e.riskBand] ?? e.riskBand}</span>
                    </td>
                    <td>{CHANNEL_LABEL[e.channel] ?? e.channel}</td>
                    <td>{e.aiServiceId ?? "—"}</td>
                    <td>{e.department}</td>
                    <td className="font-mono" style={{ fontSize: 12 }}>
                      {e.clientIp ?? "—"}
                    </td>
                    <td className="font-mono" style={{ color: "var(--fog)", fontSize: 12 }}>
                      {e.entitiesDetected.length ? e.entitiesDetected.slice(0, 3).join(", ") + (e.entitiesDetected.length > 3 ? "…" : "") : "—"}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="icon-btn"
                        title="Voir le détail"
                        aria-label={`Détail de l'événement ${e.eventId}`}
                        onClick={() => setSelected(e)}
                      >
                        <DetailIcon />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <NumberedPagination page={page} pageCount={pageCount} total={total} from={from} to={to} onPageChange={setPage} />
      </div>

      <div className={`drawer-root${selected ? " is-open" : ""}`} aria-hidden={!selected}>
        <button type="button" className="drawer-backdrop" aria-label="Fermer le détail" onClick={() => setSelected(null)} />
        <aside className="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="event-drawer-title">
          {selected ? (
            <>
              <header className="drawer-head">
                <div>
                  <p className="panel-kicker font-mono">Événement</p>
                  <h2 id="event-drawer-title">Détail d'audit</h2>
                  <p className="drawer-sub font-mono">{new Date(selected.occurredAt).toLocaleString("fr-FR")}</p>
                </div>
                <button type="button" className="icon-btn" aria-label="Fermer" onClick={() => setSelected(null)}>
                  <CloseIcon />
                </button>
              </header>

              <div className="drawer-body">
                <section className="drawer-section">
                  <h3>Décision</h3>
                  <dl>
                    <DetailRow label="Action appliquée">
                      <RiskBadge value={selected.action} />
                    </DetailRow>
                    {selected.serverDecision ? (
                      <DetailRow label="Décision serveur">
                        <RiskBadge value={selected.serverDecision.action} />
                        {diverges(selected) ? (
                          <span style={{ marginLeft: 8, fontSize: 12, color: "var(--warn, #d97706)" }}>
                            Divergence : l'agent n'a pas appliqué la décision recalculée.
                          </span>
                        ) : null}
                      </DetailRow>
                    ) : null}
                    <DetailRow label="Score de risque">
                      <span className="font-mono">
                        {selected.riskScore}/100 · {BAND_LABEL[selected.riskBand] ?? selected.riskBand}
                      </span>
                    </DetailRow>
                    <DetailRow label="Politique">{selected.policyId ?? "—"}</DetailRow>
                    <DetailRow label="Mode dégradé">{selected.degradedMode ? "Oui" : "Non"}</DetailRow>
                    <DetailRow label="Temps de traitement">
                      {selected.processingTimeMs != null ? `${selected.processingTimeMs} ms` : "—"}
                    </DetailRow>
                  </dl>
                </section>

                <section className="drawer-section">
                  <h3>Contexte</h3>
                  <dl>
                    <DetailRow label="Canal">{CHANNEL_LABEL[selected.channel] ?? selected.channel}</DetailRow>
                    <DetailRow label="Adresse IP">
                      <span className="font-mono">{selected.clientIp ?? "—"}</span>
                    </DetailRow>
                    <DetailRow label="Service IA">{selected.aiServiceId ?? "—"}</DetailRow>
                    <DetailRow label="Région d'hébergement">{selected.hostingRegion ?? "—"}</DetailRow>
                    <DetailRow label="Direction">{selected.department}</DetailRow>
                    <DetailRow label="Catégorie de contexte">{selected.contextCategory ?? "—"}</DetailRow>
                    <DetailRow label="Agent">
                      <span className="font-mono" style={{ fontSize: 12 }}>
                        {selected.agentId ?? "—"}
                      </span>
                    </DetailRow>
                    <DetailRow label="Utilisateur (empreinte)">
                      <span className="font-mono" style={{ fontSize: 12 }} title={selected.userIdHash}>
                        {shortHash(selected.userIdHash, 16)}
                      </span>
                    </DetailRow>
                  </dl>
                </section>

                <section className="drawer-section">
                  <h3>Détection</h3>
                  <dl>
                    <DetailRow label="Entités">
                      {selected.entitiesDetected.length ? selected.entitiesDetected.join(", ") : "Aucune"}
                    </DetailRow>
                    <DetailRow label="Comptages">
                      {Object.keys(selected.entityCounts).length ? (
                        <ul className="drawer-list">
                          {Object.entries(selected.entityCounts).map(([type, count]) => (
                            <li key={type}>
                              <span>{type}</span>
                              <span className="font-mono">{count}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        "—"
                      )}
                    </DetailRow>
                    <DetailRow label="Couches">
                      {selected.detectionLayers.length ? selected.detectionLayers.join(" · ") : "—"}
                    </DetailRow>
                    <DetailRow label="Référentiels">
                      {selected.referenceFrameworks.length ? selected.referenceFrameworks.join(", ") : "—"}
                    </DetailRow>
                  </dl>
                </section>

                <section className="drawer-section">
                  <h3>Facteurs de risque</h3>
                  {selected.factorBreakdown.length === 0 ? (
                    <p className="drawer-empty">Aucun détail de facteur.</p>
                  ) : (
                    <ul className="drawer-factors">
                      {selected.factorBreakdown.map((f) => (
                        <li key={f.factor}>
                          <div className="drawer-factor-top">
                            <strong>{FACTOR_LABEL[f.factor] ?? f.factor}</strong>
                            <span className="font-mono">
                              {f.contribution.toFixed(1)} pts
                            </span>
                          </div>
                          <div className="drawer-factor-meta font-mono">
                            brut {f.rawScore} · poids {(f.weight * 100).toFixed(0)}%
                          </div>
                          <p>{f.explanation}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {selected.hasEscrow ? <RevealSection key={selected.eventId} eventId={selected.eventId} role={role} /> : null}

                <section className="drawer-section">
                  <h3>Traçabilité</h3>
                  <dl>
                    <DetailRow label="Identifiant">
                      <span className="font-mono" style={{ fontSize: 12, wordBreak: "break-all" }}>
                        {selected.eventId}
                      </span>
                    </DetailRow>
                    <DetailRow label="Séquence">
                      <span className="font-mono">{selected.sequence ?? "—"}</span>
                    </DetailRow>
                    <DetailRow label="Empreinte">
                      <span className="font-mono" style={{ fontSize: 11, wordBreak: "break-all" }}>
                        {selected.eventHash}
                      </span>
                    </DetailRow>
                    <DetailRow label="Empreinte précédente">
                      <span className="font-mono" style={{ fontSize: 11, wordBreak: "break-all" }}>
                        {selected.prevEventHash ?? "—"}
                      </span>
                    </DetailRow>
                  </dl>
                </section>
              </div>
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

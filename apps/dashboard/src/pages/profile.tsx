import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, logoutSession, setSession, type AuthUser } from "../api";
import { ConfirmModal } from "../confirm-modal";
import { PageHeader, RiskBadge } from "../ui";

const ROLE_LABELS: Record<string, string> = {
  USER: "Collaborateur",
  RSSI: "RSSI",
  DPO: "DPO",
  ADMIN: "Administrateur",
};

const RISK_LABELS: Record<string, string> = {
  low: "Faible",
  moderate: "Modéré",
  high: "Élevé",
};

export function ProfilePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [quitting, setQuitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api<AuthUser>("/v1/auth/me")
      .then((me) => {
        if (!cancelled) {
          setUser(me);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function confirmLogout() {
    setQuitting(true);
    try {
      await logoutSession();
      navigate("/login");
    } finally {
      setQuitting(false);
      setConfirmQuit(false);
    }
  }

  if (error) {
    return (
      <div>
        <PageHeader kicker="Compte" title="Profil" lead="Identité de la session ouverte." />
        <p className="notice-err">{error}</p>
      </div>
    );
  }

  if (!user) {
    return <p style={{ color: "var(--fog)" }}>Chargement du profil…</p>;
  }

  const initials = user.displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  const risk = user.departmentRiskLevel;
  const riskLabel = risk ? (RISK_LABELS[risk] ?? risk) : null;

  return (
    <div>
      <PageHeader
        kicker="Compte"
        title="Profil"
        lead="Identité et périmètre de la session ouverte sur la passerelle."
        actions={
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmQuit(true)}>
            Se déconnecter
          </button>
        }
      />

      <div className="profile-layout">
        <section className="panel profile-card">
          <div className="profile-identity">
            <span className="profile-avatar" aria-hidden>
              {initials}
            </span>
            <div>
              <h2>{user.displayName}</h2>
              <p className="font-mono">{user.email}</p>
            </div>
          </div>

          <dl className="profile-grid">
            <div>
              <dt>Rôle</dt>
              <dd>{ROLE_LABELS[user.role] ?? user.role}</dd>
            </div>
            <div>
              <dt>Direction</dt>
              <dd>{user.department || "—"}</dd>
            </div>
            <div>
              <dt>Juridiction</dt>
              <dd className="font-mono">{user.jurisdiction || "—"}</dd>
            </div>
            <div>
              <dt>Risque direction</dt>
              <dd>
                {risk && riskLabel ? (
                  <span className="profile-risk">
                    <RiskBadge value={risk} />
                    <span>{riskLabel}</span>
                  </span>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="profile-grid-wide">
              <dt>Identifiant session</dt>
              <dd className="font-mono profile-id">{user.id}</dd>
            </div>
          </dl>
        </section>

        <aside className="panel profile-aside">
          <p className="panel-kicker font-mono">Session</p>
          <h2>Poste ouvert</h2>
          <p>
            Les jetons d&apos;accès sont courts ; un refresh maintient la session. La déconnexion révoque
            l&apos;accès côté serveur.
          </p>
          <ul className="profile-hints">
            <li>Access JWT à durée limitée</li>
            <li>Refresh opaque stocké côté serveur</li>
            <li>Révocation immédiate au logout</li>
          </ul>
        </aside>
      </div>

      <MfaPanel />

      <ConfirmModal
        open={confirmQuit}
        title="Se déconnecter ?"
        description="La session sera révoquée sur le serveur. Vous devrez vous authentifier à nouveau pour rouvrir le poste."
        confirmLabel="Se déconnecter"
        cancelLabel="Rester connecté"
        danger
        busy={quitting}
        onConfirm={() => void confirmLogout()}
        onCancel={() => !quitting && setConfirmQuit(false)}
      />
    </div>
  );
}

type MfaStatus = { enabled: boolean; enabledAt: string | null; required: boolean; sessionMfa: boolean };
type MfaSetup = { secret: string; otpauthUri: string; qrDataUrl: string | null };

/** Second facteur TOTP : état et activation volontaire depuis le profil. */
function MfaPanel() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api<MfaStatus>("/v1/auth/mfa/status")
      .then(setStatus)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

  useEffect(() => {
    void load();
  }, []);

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      setSetup(await api<MfaSetup>("/v1/auth/mfa/setup-self", { method: "POST" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ accessToken: string; refreshToken: string }>("/v1/auth/mfa/activate-self", {
        method: "POST",
        body: JSON.stringify({ code: code.replace(/\s/g, "") }),
      });
      // Nouvelle session : le jeton d'accès porte désormais la preuve du second facteur.
      setSession(res.accessToken, res.refreshToken);
      setSetup(null);
      setCode("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <p className="panel-kicker font-mono">Sécurité</p>
      <h2>Second facteur (TOTP)</h2>
      {!status ? (
        <p style={{ color: "var(--fog)" }}>{error ?? "Chargement…"}</p>
      ) : status.enabled ? (
        <p>
          Actif depuis le {status.enabledAt ? new Date(status.enabledAt).toLocaleDateString("fr-FR") : "—"}.
          {status.sessionMfa ? " Cette session a été ouverte avec le second facteur." : " Reconnectez-vous pour que cette session en porte la preuve."}
          {" "}En cas de perte du téléphone, un administrateur peut le réinitialiser.
        </p>
      ) : setup ? (
        <div style={{ display: "grid", gap: 10, maxWidth: 420 }}>
          <p>Ajoutez ce compte dans votre application d&apos;authentification, puis saisissez le code affiché.</p>
          {setup.qrDataUrl ? (
            <img src={setup.qrDataUrl} alt="QR code d'enrôlement TOTP" width={180} height={180} style={{ background: "#fff", padding: 8, borderRadius: 8 }} />
          ) : null}
          <p>
            Clé : <code className="font-mono" style={{ userSelect: "all" }}>{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
          </p>
          <input
            className="input font-mono"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            placeholder="123 456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-primary" disabled={busy || code.replace(/\s/g, "").length !== 6} onClick={() => void activate()}>
              Activer
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setSetup(null)}>
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          <p>
            {status.required
              ? "Obligatoire pour votre rôle : il vous sera demandé à la prochaine connexion."
              : "Recommandé : protège le compte même si le mot de passe fuit."}
          </p>
          <div>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void begin()}>
              Activer le second facteur
            </button>
          </div>
        </div>
      )}
      {error && status ? <p className="notice-err">{error}</p> : null}
    </section>
  );
}

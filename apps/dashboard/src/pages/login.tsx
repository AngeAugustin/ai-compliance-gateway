import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { parseLoginError, setSession } from "../api";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

function formatClock(date: Date) {
  return new Intl.DateTimeFormat("fr-BJ", {
    timeZone: "Africa/Porto-Novo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("rssi@cnss.bj");
  const [password, setPassword] = useState("Admin!2026");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(() => formatClock(new Date()));
  const [stage, setStage] = useState<Stage>({ kind: "password" });
  const [code, setCode] = useState("");

  useEffect(() => {
    const id = window.setInterval(() => {
      const t = Date.now();
      setClock(formatClock(new Date(t)));
      setNow(t);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (lockedUntil != null && now >= lockedUntil) setLockedUntil(null);
  }, [lockedUntil, now]);

  /** POST d'authentification ; null en cas d'échec (message ou verrouillage déjà affiché). */
  async function post(path: string, body: unknown): Promise<AuthResponse | null> {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return (await res.json()) as AuthResponse;
    const err = parseLoginError(await res.text(), res.status);
    if (err.code === "ACCOUNT_LOCKED" || res.status === 423) {
      setLockedUntil(Date.now() + (err.retryAfterSeconds ?? 900) * 1000);
      return null;
    }
    const msg = typeof err.message === "string" ? err.message : Array.isArray(err.message) ? err.message.join(" · ") : "";
    setError(msg || "Identifiants refusés. Vérifiez le courriel et le mot de passe.");
    return null;
  }

  function openSession(data: AuthResponse) {
    const access = data.accessToken ?? data.token;
    if (!access || !data.refreshToken) {
      setError("Réponse d'authentification incomplète.");
      return;
    }
    setSession(access, data.refreshToken);
    navigate("/");
  }

  function restart() {
    setStage({ kind: "password" });
    setCode("");
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLockedUntil(null);
    setBusy(true);
    try {
      if (stage.kind === "password") {
        const data = await post("/v1/auth/login", { email, password });
        if (!data) return;
        if (data.mfaRequired && data.mfaToken) {
          setCode("");
          setStage({ kind: "mfa", token: data.mfaToken });
          return;
        }
        if (data.mfaSetupRequired && data.mfaToken) {
          const setup = await post("/v1/auth/mfa/setup", { mfaToken: data.mfaToken });
          if (!setup) return;
          setCode("");
          setStage({
            kind: "setup",
            token: data.mfaToken,
            secret: setup.secret ?? null,
            uri: setup.otpauthUri ?? null,
            qr: setup.qrDataUrl ?? null,
          });
          return;
        }
        openSession(data);
        return;
      }
      const data = await post(stage.kind === "mfa" ? "/v1/auth/mfa/verify" : "/v1/auth/mfa/activate", {
        mfaToken: stage.token,
        code: code.replace(/\s/g, ""),
      });
      if (!data) {
        setCode("");
        return;
      }
      openSession(data);
    } finally {
      setBusy(false);
    }
  }

  const lockoutSeconds =
    lockedUntil != null ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0;
  const formBlocked = lockoutSeconds > 0;

  return (
    <div className="login-screen">
      <header className="login-topbar">
        <div className="login-topbar-inner">
          <div className="login-brand">
            <span className="login-brand-mark" aria-hidden>
              ACG
            </span>
            <span className="login-brand-title">AI Compliance Gateway</span>
          </div>
          <div className="login-trust">
            <span className="login-pill login-pill-ok">
              <span className="login-pulse" aria-hidden />
              Système opérationnel
            </span>
            <span className="login-pill login-pill-mute">
              <LockIcon />
              TLS 1.3 / E2EE
            </span>
          </div>
        </div>
      </header>

      <main className="login-main">
        <section className="login-stage">
          <div className="login-chip">
            <span className="login-chip-dot" aria-hidden />
            CNSS · COTONOU · PASSERELLE IA
          </div>
          <div className="login-stage-copy">
            <h1>
              Salle de <span>contrôle</span>
            </h1>
            <p>
              La passerelle inspecte et anonymise les prompts avant transmission vers{" "}
              <strong>ChatGPT</strong>, <strong>Claude</strong> et <strong>Gemini</strong>. Aucune
              valeur en clair n’est journalisée.
            </p>
          </div>
          <div className="login-telemetry">
            <div className="login-clock-block">
              <time className="font-mono" dateTime={new Date().toISOString()}>
                {clock}
              </time>
              <span className="font-mono">WAT</span>
            </div>
            <div className="login-telemetry-sep" aria-hidden />
            <div className="login-telemetry-loc font-mono">
              <span>Cotonou</span>
              <span>· GMT+1</span>
            </div>
            <div className="login-node font-mono">
              <span className="login-chip-dot" aria-hidden />
              Nœud Bénin Primaire
            </div>
          </div>
        </section>

        <section className="login-form-wrap">
          <div className="login-card">
            <div className="login-card-head">
              <div className="login-card-meta">
                <span className="font-mono">SESSION</span>
                <span className="login-access font-mono">ACCÈS NIVEAU 3</span>
              </div>
              <h2>Ouvrir le poste</h2>
              <p>
                Réservé au <strong>RSSI</strong> et au <strong>DPO</strong>.
              </p>
            </div>

            <form onSubmit={onSubmit} className="login-form">
              {stage.kind !== "password" ? (
                <>
                  {stage.kind === "setup" ? (
                    <div className="login-field">
                      <p className="field-label">Activation du second facteur (obligatoire pour votre rôle)</p>
                      <p style={{ fontSize: 13, lineHeight: 1.5 }}>
                        Ajoutez ce compte dans une application d&apos;authentification (Google Authenticator, Microsoft
                        Authenticator, FreeOTP…), puis saisissez le code à 6 chiffres affiché.
                      </p>
                      {stage.qr ? (
                        <img src={stage.qr} alt="QR code d'enrôlement TOTP" width={180} height={180} style={{ background: "#fff", padding: 8, borderRadius: 8 }} />
                      ) : null}
                      {stage.secret ? (
                        <p style={{ fontSize: 13 }}>
                          Clé à saisir manuellement :{" "}
                          <code className="font-mono" style={{ userSelect: "all", wordBreak: "break-all" }}>
                            {stage.secret.replace(/(.{4})/g, "$1 ").trim()}
                          </code>
                        </p>
                      ) : null}
                      {stage.uri ? (
                        <a className="login-hw-link" href={stage.uri}>
                          Ouvrir dans l&apos;application d&apos;authentification
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="login-field">
                    <label className="field-label" htmlFor="login-code">
                      {stage.kind === "mfa" ? "Code de l'application d'authentification" : "Premier code affiché"}
                    </label>
                    <div className="login-input-shell">
                      <span className="login-input-icon" aria-hidden>
                        <LockIcon />
                      </span>
                      <input
                        id="login-code"
                        className="login-input font-mono"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9 ]{6,7}"
                        maxLength={7}
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="123 456"
                        autoFocus
                        required
                        disabled={formBlocked}
                      />
                    </div>
                  </div>
                </>
              ) : (
              <>
              <div className="login-field">
                <label className="field-label" htmlFor="login-email">
                  Courriel institutionnel
                </label>
                <div className="login-input-shell">
                  <span className="login-input-icon" aria-hidden>
                    <UserIcon />
                  </span>
                  <input
                    id="login-email"
                    className="login-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                    placeholder="nom@cnss.bj"
                    required
                    disabled={formBlocked}
                  />
                </div>
              </div>

              <div className="login-field">
                <div className="login-label-row">
                  <label className="field-label" htmlFor="login-password">
                    Mot de passe
                  </label>
                  <span className="login-hw-link">Clé matérielle ?</span>
                </div>
                <div className="login-input-shell">
                  <span className="login-input-icon" aria-hidden>
                    <LockIcon />
                  </span>
                  <input
                    id="login-password"
                    className="login-input login-input-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    disabled={formBlocked}
                  />
                  <button
                    type="button"
                    className="login-eye"
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    onClick={() => setShowPassword((v) => !v)}
                    disabled={formBlocked}
                  >
                    <EyeIcon />
                  </button>
                </div>
              </div>
              </>
              )}

              {formBlocked ? (
                <div className="login-lockout" role="alert">
                  <strong>Compte verrouillé</strong>
                  <p>
                    Trop d&apos;échecs de connexion. Réessayez dans{" "}
                    <span className="font-mono">{formatLockDuration(lockoutSeconds)}</span>.
                  </p>
                </div>
              ) : null}
              {error && !formBlocked ? <p className="notice-err">{error}</p> : null}

              <button type="submit" className="login-submit" disabled={busy || formBlocked}>
                <span>
                  {busy
                    ? "Vérification…"
                    : formBlocked
                      ? "Verrouillé"
                      : stage.kind === "mfa"
                        ? "Valider le code"
                        : stage.kind === "setup"
                          ? "Activer et entrer"
                          : "Entrer"}
                </span>
                <span aria-hidden>→</span>
              </button>
              {stage.kind !== "password" ? (
                <button type="button" className="login-hw-link" onClick={restart} style={{ background: "none", border: 0, cursor: "pointer" }}>
                  ← Revenir à l&apos;identifiant
                </button>
              ) : null}
            </form>

            <div className="login-card-foot">
              <span>Audit anonymisé</span>
              <span aria-hidden>·</span>
              <span>Politique IA</span>
              <span aria-hidden>·</span>
              <span>Assistance SOC</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

type AuthResponse = {
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  mfaRequired?: boolean;
  mfaSetupRequired?: boolean;
  mfaToken?: string;
  secret?: string;
  otpauthUri?: string;
  qrDataUrl?: string | null;
};

type Stage =
  | { kind: "password" }
  | { kind: "mfa"; token: string }
  | { kind: "setup"; token: string; secret: string | null; uri: string | null; qr: string | null };

function formatLockDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m <= 0) return `${s} s`;
  if (s === 0) return `${m} min`;
  return `${m} min ${s} s`;
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
      />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

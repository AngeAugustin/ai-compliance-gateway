import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import { PageHeader, RiskBadge, RiskGauge } from "../ui";
import type { AiService } from "./service-form";

type Factor = {
  factor: string;
  rawScore: number;
  weight: number;
  contribution: number;
  explanation: string;
};

type Result = {
  decision: string;
  riskScore: number;
  riskBand: string;
  policyName: string | null;
  userMessage: string | null;
  factorBreakdown: Factor[];
  referenceFrameworks: string[];
};

const FACTOR_LABEL: Record<string, string> = {
  entity_sensitivity: "Sensibilité des entités",
  quasi_identifier_combination: "Quasi-identifiants",
  hosting_location: "Lieu d'hébergement",
  organizational_context: "Contexte organisationnel",
};

function factorColor(contribution: number): string {
  if (contribution >= 30) return "var(--block)";
  if (contribution >= 18) return "var(--mask)";
  if (contribution >= 10) return "var(--warn)";
  return "var(--allow)";
}

async function fileToBase64(file: File): Promise<{ fileName: string; mimeType: string; base64: string }> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return { fileName: file.name, mimeType: file.type || "application/octet-stream", base64: btoa(binary) };
}

export function InspectPage() {
  const [text, setText] = useState(
    "Peux-tu rédiger un mail pour virer 2 500 000 FCFA de cotisations de Marie Agbodji (n° assuré CNSS A12345678) vers MoMo 01 97 12 34 56 ?",
  );
  const [services, setServices] = useState<AiService[]>([]);
  const [service, setService] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [evalTick, setEvalTick] = useState(0);

  useEffect(() => {
    void api<AiService[]>("/v1/ai-services")
      .then((items) => {
        const enabled = items.filter((s) => s.enabled);
        setServices(enabled);
        setService((current) => {
          if (current && enabled.some((s) => s.id === current)) return current;
          return enabled.find((s) => s.id === "chatgpt.com")?.id ?? enabled[0]?.id ?? "";
        });
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!service) {
      setError("Aucun service IA disponible.");
      return;
    }
    try {
      const encoded = await Promise.all(files.map(fileToBase64));
      const res = await api<Result>("/v1/interactions/inspect", {
        method: "POST",
        body: JSON.stringify({ text, aiServiceId: service, channel: "api", files: encoded }),
      });
      setResult(res);
      setEvalTick((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const selected = services.find((s) => s.id === service);
  const factors = result
    ? [...result.factorBreakdown].sort((a, b) => b.contribution - a.contribution)
    : [];
  const maxContribution = Math.max(1, ...factors.map((f) => f.contribution));

  return (
    <div>
      <PageHeader
        kicker="Simulation"
        title="Inspection d'un prompt"
        lead="Testez le pipeline : texte + pièces jointes (Word, Excel, PowerPoint, PDF, CSV, SQL, ZIP, code, images OCR…)."
      />
      <form onSubmit={onSubmit} className="split-2">
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label className="field-label" htmlFor="inspect-text">
            Prompt à évaluer
          </label>
          <textarea id="inspect-text" className="input" value={text} onChange={(e) => setText(e.target.value)} rows={9} style={{ fontFamily: "IBM Plex Mono, monospace" }} />
          <label className="field-label" htmlFor="inspect-files">
            Pièces jointes (optionnel)
          </label>
          <input
            id="inspect-files"
            type="file"
            multiple
            accept=".txt,.csv,.tsv,.md,.json,.xml,.html,.sql,.yml,.yaml,.env,.log,.rtf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.odt,.ods,.odp,.pdf,.zip,.png,.jpg,.jpeg,.webp,.gif,.bmp,.js,.ts,.py"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          {files.length > 0 ? (
            <p className="font-mono" style={{ fontSize: 12, color: "var(--fog)", margin: 0 }}>
              {files.map((f) => f.name).join(" · ")}
            </p>
          ) : null}
          <label className="field-label" htmlFor="inspect-service">
            Service IA cible
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              id="inspect-service"
              className="input"
              value={service}
              onChange={(e) => setService(e.target.value)}
              disabled={services.length === 0}
              style={{ flex: 1 }}
            >
              {services.length === 0 ? <option value="">Chargement…</option> : null}
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.hostingRegion}
                  {s.freeAccess ? " · libre" : ""}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary" disabled={!service}>
              Évaluer
            </button>
          </div>
          {selected ? (
            <p className="font-mono" style={{ fontSize: 12, color: "var(--fog)", margin: 0 }}>
              {selected.id} · baseline {selected.riskBaseline}
            </p>
          ) : null}
          {error ? <p className="notice-err">{error}</p> : null}
        </div>
        <div className="inspect-result-col">
          <section className="panel inspect-factors" aria-live="polite">
            <p className="panel-kicker font-mono">Facteurs de risque</p>
            <h2>Composition du score</h2>
            {result ? (
              <ul className="inspect-factor-list" key={evalTick}>
                {factors.map((f, i) => {
                  const color = factorColor(f.contribution);
                  const width = `${(f.contribution / maxContribution) * 100}%`;
                  return (
                    <li key={f.factor} style={{ ["--factor-delay" as string]: `${i * 80}ms` }}>
                      <div className="inspect-factor-top">
                        <strong>{FACTOR_LABEL[f.factor] ?? f.factor}</strong>
                        <span className="font-mono" style={{ color }}>
                          {f.contribution.toFixed(1)} pts
                        </span>
                      </div>
                      <div className="inspect-factor-track">
                        <div
                          className="inspect-factor-fill"
                          style={{ background: color, ["--factor-width" as string]: width }}
                        />
                      </div>
                      <div className="inspect-factor-meta font-mono">
                        brut {f.rawScore.toFixed(0)} · poids {(f.weight * 100).toFixed(0)}%
                      </div>
                      <p>{f.explanation}</p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p style={{ color: "var(--fog)", margin: 0 }}>Les contributions s'afficheront ici après évaluation.</p>
            )}
          </section>

          <section className="panel">
            {result ? (
              <>
                <RiskBadge value={result.decision} />
                <div style={{ marginTop: 16 }}>
                  <RiskGauge value={result.riskScore} />
                </div>
                <p style={{ color: "var(--fog)", marginBottom: 8 }}>{result.policyName ?? "Aucune règle n'a matché"}</p>
                <p style={{ marginTop: 0 }}>{result.userMessage}</p>
                {result.referenceFrameworks.length > 0 ? (
                  <p className="font-mono" style={{ fontSize: 12, color: "var(--seal)", marginBottom: 0 }}>
                    {result.referenceFrameworks.join(" · ")}
                  </p>
                ) : null}
              </>
            ) : (
              <p style={{ color: "var(--fog)", margin: 0 }}>La décision s'affichera ici après évaluation.</p>
            )}
          </section>
        </div>
      </form>
    </div>
  );
}

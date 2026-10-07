import { FormEvent, useState } from "react";
import { api } from "../api";
import { PageHeader, RiskBadge, RiskGauge } from "../ui";

type Result = {
  decision: string;
  riskScore: number;
  riskBand: string;
  policyName: string | null;
  userMessage: string | null;
  factorBreakdown: { factor: string; contribution: number; explanation: string }[];
  referenceFrameworks: string[];
};

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
  const [service, setService] = useState("chatgpt.com");
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const encoded = await Promise.all(files.map(fileToBase64));
      const res = await api<Result>("/v1/interactions/inspect", {
        method: "POST",
        body: JSON.stringify({ text, aiServiceId: service, channel: "api", files: encoded }),
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

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
          <div style={{ display: "flex", gap: 8 }}>
            <input className="input" value={service} onChange={(e) => setService(e.target.value)} aria-label="Service IA" />
            <button type="submit" className="btn btn-primary">
              Évaluer
            </button>
          </div>
          {error ? <p className="notice-err">{error}</p> : null}
        </div>
        <div className="panel">
          {result ? (
            <>
              <RiskBadge value={result.decision} />
              <div style={{ marginTop: 16 }}>
                <RiskGauge value={result.riskScore} />
              </div>
              <p style={{ color: "var(--fog)", marginBottom: 8 }}>{result.policyName ?? "Aucune règle n'a matché"}</p>
              <p style={{ marginTop: 0 }}>{result.userMessage}</p>
            </>
          ) : (
            <p style={{ color: "var(--fog)", margin: 0 }}>La décision s'affichera ici après évaluation.</p>
          )}
        </div>
      </form>
      {result ? (
        <div className="panel" style={{ marginTop: 16 }}>
          <p className="panel-kicker font-mono">Facteurs de risque</p>
          <h2>Pourquoi ce score</h2>
          {result.factorBreakdown.map((f) => (
            <div key={f.factor} style={{ marginBottom: 12 }}>
              <div className="font-mono" style={{ fontSize: 11, color: "var(--fog)" }}>
                {f.factor} · {f.contribution.toFixed(1)}
              </div>
              <div style={{ fontSize: 14 }}>{f.explanation}</div>
            </div>
          ))}
          <p className="font-mono" style={{ fontSize: 12, color: "var(--seal)", marginBottom: 0 }}>
            {result.referenceFrameworks.join(" · ")}
          </p>
        </div>
      ) : null}
    </div>
  );
}

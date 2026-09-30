import { useMemo, useState } from "react";
import {
  BAND_LABELS,
  CHANNEL_LABELS,
  CHANNELS,
  CLAUSE_KIND_OPTIONS,
  COMPARE_LABELS,
  CONDITION_TEMPLATES,
  CONTEXT_CATEGORIES,
  ENTITY_DEFINITIONS,
  ENTITY_PICKER,
  FLAG_LABELS,
  POLICY_DEPARTMENTS,
  RISK_BANDS,
  compileCondition,
  describeCondition,
  emptyClause,
  emptyDraft,
  parseConditionDraft,
  type Clause,
  type ClauseKind,
  type CompareOp,
  type ConditionDraft,
  type FlagName,
} from "@acg/shared";

const COMPARE_OPS: CompareOp[] = [">=", ">", "=", "<=", "<", "!="];

export function ConditionBuilder({
  value,
  onChange,
}: {
  value: string;
  onChange: (expr: string) => void;
}) {
  const parsed = useMemo(() => parseConditionDraft(value), [value]);
  const [mode, setMode] = useState<"visual" | "formula">(parsed.ok ? "visual" : "formula");
  const [draft, setDraft] = useState<ConditionDraft>(parsed.ok ? parsed.draft : emptyDraft());
  const [formula, setFormula] = useState(value);
  const [showFormula, setShowFormula] = useState(false);

  function emit(next: ConditionDraft) {
    setDraft(next);
    const compiled = compileCondition(next);
    if (compiled.errors.length === 0) onChange(compiled.expr);
  }

  function updateClause(id: string, next: Clause) {
    emit({ ...draft, clauses: draft.clauses.map((c) => (c.id === id ? next : c)) });
  }

  function removeClause(id: string) {
    emit({ ...draft, clauses: draft.clauses.filter((c) => c.id !== id) });
  }

  const compiled = compileCondition(draft);
  const sentence = describeCondition(draft);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
        <label style={lab}>Quand appliquer cette règle</label>
        <button type="button" onClick={() => setMode(mode === "visual" ? "formula" : "visual")} className="btn-link">
          {mode === "visual" ? "Formule avancée" : "Éditeur guidé"}
        </button>
      </div>

      {mode === "formula" ? (
        <div>
          {!parsed.ok ? (
            <p style={{ color: "var(--warn)", fontSize: 13, margin: "0 0 8px" }}>{parsed.reason}</p>
          ) : (
            <p style={{ color: "var(--fog)", fontSize: 13, margin: "0 0 8px" }}>
              Réservé aux règles qui mélangent ET et OU, ou une syntaxe hors éditeur.
            </p>
          )}
          <textarea
            className="input"
            value={formula}
            onChange={(e) => {
              setFormula(e.target.value);
              onChange(e.target.value);
            }}
            rows={5}
            required
            style={{ fontFamily: "IBM Plex Mono, monospace" }}
          />
        </div>
      ) : (
        <div className="si-panel">
          <div className="si-rail">SI</div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {CONDITION_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => emit(t.draft())}
                  className="btn btn-ghost"
                >
                  {t.label}
                </button>
              ))}
            </div>
            <label style={{ ...lab, display: "flex", alignItems: "center", gap: 8 }}>
              Relier les critères par
              <select
                value={draft.combinator}
                onChange={(e) => emit({ ...draft, combinator: e.target.value as "AND" | "OR" })}
                style={{ ...input, width: "auto" }}
              >
                <option value="AND">toutes (ET)</option>
                <option value="OR">n'importe laquelle (OU)</option>
              </select>
            </label>
            {draft.clauses.map((clause, index) => (
              <div key={clause.id}>
                {index > 0 ? (
                  <p className="font-mono" style={{ margin: "0 0 8px", fontSize: 10, letterSpacing: "0.16em", color: "var(--seal)" }}>
                    {draft.combinator === "OR" ? "OU" : "ET"}
                  </p>
                ) : null}
                <ClauseCard clause={clause} onChange={(c) => updateClause(clause.id, c)} onRemove={() => removeClause(clause.id)} />
              </div>
            ))}
            <AddCriterion onAdd={(kind) => emit({ ...draft, clauses: [...draft.clauses, emptyClause(kind)] })} />
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink)", lineHeight: 1.45 }}>{sentence}</p>
            {compiled.errors.length > 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: "var(--warn)" }}>{compiled.errors.join(" · ")}</p>
            ) : null}
            <button type="button" onClick={() => setShowFormula((v) => !v)} className="btn-link">
              {showFormula ? "Masquer la formule" : "Voir la formule générée"}
            </button>
            {showFormula ? (
              <pre className="font-mono" style={{ margin: 0, fontSize: 11, color: "var(--fog)", whiteSpace: "pre-wrap" }}>
                {compiled.expr || "—"}
              </pre>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function AddCriterion({ onAdd }: { onAdd: (kind: ClauseKind) => void }) {
  return (
    <label style={{ ...lab, display: "flex", alignItems: "center", gap: 8 }}>
      Ajouter un critère
      <select
        defaultValue=""
        onChange={(e) => {
          const kind = e.target.value as ClauseKind;
          if (kind) onAdd(kind);
          e.target.value = "";
        }}
        style={{ ...input, width: "auto", maxWidth: "100%" }}
      >
        <option value="" disabled>
          Choisir…
        </option>
        {CLAUSE_KIND_OPTIONS.map((opt) => (
          <option key={opt.kind} value={opt.kind} title={opt.hint}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ClauseCard({ clause, onChange, onRemove }: { clause: Clause; onChange: (c: Clause) => void; onRemove: () => void }) {
  const meta = CLAUSE_KIND_OPTIONS.find((o) => o.kind === clause.kind);
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <strong style={{ fontSize: 13 }}>{meta?.label ?? clause.kind}</strong>
        <button type="button" className="btn-link" onClick={onRemove} aria-label="Retirer ce critère">
          Retirer
        </button>
      </div>
      <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--fog)" }}>{meta?.hint}</p>
      <ClauseFields clause={clause} onChange={onChange} />
    </div>
  );
}

function ClauseFields({ clause, onChange }: { clause: Clause; onChange: (c: Clause) => void }) {
  switch (clause.kind) {
    case "entity":
      return (
        <div>
          <select
            value={clause.match}
            onChange={(e) => onChange({ ...clause, match: e.target.value as "any" | "all" })}
            style={{ ...input, width: "auto", marginBottom: 8 }}
          >
            <option value="any">Au moins une de ces données</option>
            <option value="all">Toutes ces données à la fois</option>
          </select>
          {ENTITY_PICKER.map((group) => (
            <div key={group.family} style={{ marginBottom: 8 }}>
              <p className="font-mono" style={{ margin: "0 0 6px", fontSize: 10, letterSpacing: "0.12em", color: "var(--fog)" }}>
                {group.label.toUpperCase()}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {group.types.map((type) => {
                  const selected = clause.types.includes(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() =>
                        onChange({
                          ...clause,
                          types: selected ? clause.types.filter((t) => t !== type) : [...clause.types, type],
                        })
                      }
                      style={chip(selected)}
                    >
                      {ENTITY_DEFINITIONS[type].label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      );
    case "band":
      return (
        <div style={row}>
          <CompareSelect value={clause.op} onChange={(op) => onChange({ ...clause, op })} />
          <select value={clause.value} onChange={(e) => onChange({ ...clause, value: e.target.value as typeof clause.value })} style={input}>
            {RISK_BANDS.map((b) => (
              <option key={b} value={b}>
                {BAND_LABELS[b]}
              </option>
            ))}
          </select>
        </div>
      );
    case "score":
    case "quasi":
    case "direct":
    case "count":
      return (
        <div style={row}>
          <CompareSelect value={clause.op} onChange={(op) => onChange({ ...clause, op })} />
          <input
            type="number"
            min={0}
            max={clause.kind === "score" ? 100 : 50}
            value={clause.value}
            onChange={(e) => onChange({ ...clause, value: Number(e.target.value) })}
            style={input}
          />
        </div>
      );
    case "department":
      return (
        <div>
          <select
            value={clause.match}
            onChange={(e) => onChange({ ...clause, match: e.target.value as typeof clause.match })}
            style={{ ...input, width: "auto", marginBottom: 8 }}
          >
            <option value="in">Parmi</option>
            <option value="eq">Est exactement</option>
            <option value="not_in">N'est pas parmi</option>
          </select>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {POLICY_DEPARTMENTS.map((dept) => {
              const selected = clause.values.includes(dept);
              return (
                <button
                  key={dept}
                  type="button"
                  onClick={() => {
                    if (clause.match === "eq") {
                      onChange({ ...clause, values: [dept] });
                      return;
                    }
                    onChange({
                      ...clause,
                      values: selected ? clause.values.filter((v) => v !== dept) : [...clause.values, dept],
                    });
                  }}
                  style={chip(selected)}
                >
                  {dept}
                </button>
              );
            })}
          </div>
        </div>
      );
    case "channel":
      return (
        <select value={clause.value} onChange={(e) => onChange({ ...clause, value: e.target.value as typeof clause.value })} style={input}>
          {CHANNELS.map((ch) => (
            <option key={ch} value={ch}>
              {CHANNEL_LABELS[ch]}
            </option>
          ))}
        </select>
      );
    case "context":
      return (
        <select value={clause.value} onChange={(e) => onChange({ ...clause, value: e.target.value as typeof clause.value })} style={input}>
          {CONTEXT_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      );
    case "flag":
      return (
        <div style={row}>
          <select
            value={clause.flag}
            onChange={(e) => onChange({ ...clause, flag: e.target.value as FlagName })}
            style={input}
          >
            {(Object.keys(FLAG_LABELS) as FlagName[]).map((f) => (
              <option key={f} value={f}>
                {FLAG_LABELS[f]}
              </option>
            ))}
          </select>
          <select
            value={clause.value ? "true" : "false"}
            onChange={(e) => onChange({ ...clause, value: e.target.value === "true" })}
            style={{ ...input, width: 120 }}
          >
            <option value="true">Oui</option>
            <option value="false">Non</option>
          </select>
        </div>
      );
    case "hosting_mismatch":
      return <p style={{ margin: 0, fontSize: 13, color: "var(--ink)" }}>Le service d'IA n'est pas hébergé dans le pays de l'utilisateur.</p>;
  }
}

function CompareSelect({ value, onChange }: { value: CompareOp; onChange: (op: CompareOp) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as CompareOp)} style={{ ...input, width: "auto" }}>
      {COMPARE_OPS.map((op) => (
        <option key={op} value={op}>
          {COMPARE_LABELS[op]}
        </option>
      ))}
    </select>
  );
}

const lab: React.CSSProperties = { fontSize: 12, color: "var(--fog)", fontWeight: 500 };
const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--paper)",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: 6,
  padding: "8px 10px",
};
const card: React.CSSProperties = {
  background: "var(--paper)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: 10,
};
const row: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center" };

function chip(selected: boolean): React.CSSProperties {
  return {
    border: `1px solid ${selected ? "var(--seal)" : "var(--line)"}`,
    background: selected ? "var(--seal-soft)" : "var(--paper)",
    color: selected ? "var(--seal)" : "var(--fog)",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 12,
    cursor: "pointer",
  };
}

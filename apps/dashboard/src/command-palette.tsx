import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { NAV } from "./nav";

type Command = { id: string; label: string; hint: string; run: () => void };

function normalize(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function CommandPalette({
  open,
  onClose,
  onToggleTheme,
}: {
  open: boolean;
  onClose: () => void;
  onToggleTheme: () => void;
}) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const commands = useMemo<Command[]>(
    () => [
      ...NAV.flatMap((group) =>
        group.items.map((item) => ({
          id: item.href,
          label: item.label,
          hint: group.label,
          run: () => navigate(item.href),
        })),
      ),
      { id: "new-user", label: "Créer un utilisateur", hint: "Action", run: () => navigate("/users/nouveau") },
      { id: "new-policy", label: "Nouvelle politique", hint: "Action", run: () => navigate("/policies/nouveau") },
      { id: "new-service", label: "Ajouter un service IA", hint: "Action", run: () => navigate("/services/nouveau") },
      { id: "token", label: "Émettre un jeton d'agent", hint: "Action", run: () => navigate("/agents") },
      { id: "theme", label: "Basculer le thème clair / sombre", hint: "Affichage", run: onToggleTheme },
    ],
    [navigate, onToggleTheme],
  );

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return commands;
    return commands.filter((c) => normalize(`${c.label} ${c.hint}`).includes(q));
  }, [commands, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  function choose(command: Command) {
    onClose();
    command.run();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const command = results[active];
      if (command) choose(command);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  const activeId = results[active] ? `cmd-${active}` : undefined;

  return (
    <div
      className="palette-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Recherche rapide">
        <input
          ref={inputRef}
          className="palette-input"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={activeId}
          aria-label="Rechercher une page ou une action"
          placeholder="Rechercher une page ou une action…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <ul id="palette-list" role="listbox" className="palette-list">
          {results.length === 0 ? (
            <li className="palette-empty">Aucun résultat.</li>
          ) : (
            results.map((command, i) => (
              <li
                key={command.id}
                id={`cmd-${i}`}
                role="option"
                aria-selected={i === active}
                className={`palette-item${i === active ? " is-active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(command);
                }}
              >
                <span>{command.label}</span>
                <small>{command.hint}</small>
              </li>
            ))
          )}
        </ul>
        <div className="palette-foot" aria-hidden>
          <span>↑↓ naviguer</span>
          <span>Entrée ouvrir</span>
          <span>Échap fermer</span>
        </div>
      </div>
    </div>
  );
}

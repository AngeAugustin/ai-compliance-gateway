# Agent CLI A2 — guide opérationnel

Shim terminal (`apps/agent-cli`) qui intercepte les CLI d’IA via des wrappers PATH,
décide localement (ALLOW / WARN / MASK / BLOCK), puis lance la commande réelle.

Cœur partagé avec A1 (navigateur) : `@acg/agent-runtime`.

---

## Principe

```
Utilisateur → ~/.acg/bin/claude
           → acg-shim intercept claude -- <args>
           → AgentRuntime.intercept(..., channel="cli")
           → détection → score → politique
           → journal API (ou file hors-ligne)
           → BLOCK → exit 2
           → MASK → prompt / fichiers temp anonymisés
           → spawn(commande réelle)
```

Pas de MITM TLS : la conformité repose sur le préfixe PATH + décision avant `spawn`.

---

## Setup

Depuis la racine du repo (PowerShell) :

```powershell
# Stack locale (API :4000, Dashboard :3000)
pnpm dev

# Build A1 + A2
pnpm agents:build

# Jeton : Dashboard (RSSI) → Agents → émettre un jeton Terminal (A2)
node apps/agent-cli/dist/cli.js enroll --api http://localhost:4000 --token <JETON>

# PATH pour cette session
$env:Path = "$env:USERPROFILE\.acg\bin;" + $env:Path
```

L’enrôlement écrit `~\.acg\agent-a2.json`, crée les wrappers dans `~\.acg\bin`, et lance le démon heartbeat.

Pour un PATH permanent : ajouter `%USERPROFILE%\.acg\bin` en tête du PATH utilisateur Windows.

---

## Commandes du shim

```powershell
node apps/agent-cli/dist/cli.js help
node apps/agent-cli/dist/cli.js enroll --api http://localhost:4000 --token <JETON>
node apps/agent-cli/dist/cli.js status
node apps/agent-cli/dist/cli.js daemon
node apps/agent-cli/dist/cli.js stop
node apps/agent-cli/dist/cli.js install
node apps/agent-cli/dist/cli.js uninstall

# Intercept manuel (normalement via les wrappers PATH)
node apps/agent-cli/dist/cli.js intercept claude -- "ton prompt"
node apps/agent-cli/dist/cli.js intercept claude -- --file .\doc.pdf "résume ce fichier"
```

| Commande | Rôle |
|---|---|
| `enroll` | Enrôlement API + wrappers + démon |
| `status` | État (enrolled, agentId, apiUrl, daemon) |
| `daemon` | Heartbeat + sync politiques en arrière-plan |
| `stop` | Arrêter le démon |
| `install` | Réécrire les wrappers dans `~\.acg\bin` |
| `uninstall` | Stop démon + message retrait PATH |
| `intercept` | Décision locale puis spawn de la CLI cible |

Si `~\.acg\bin` est dans le PATH :

```powershell
claude "…"
codex "…"
gemini "…"
```

---

## Vérifications

```powershell
node apps/agent-cli/dist/cli.js status
Get-ChildItem $env:USERPROFILE\.acg\bin
Get-Content $env:USERPROFILE\.acg\daemon.log -Tail 50
Get-Content $env:USERPROFILE\.acg\agent-a2.json
Get-Content $env:USERPROFILE\.acg\queue.json
```

### Fichiers locaux (`~\.acg\`)

| Fichier | Contenu |
|---|---|
| `agent-a2.json` | URL API, agentId, clés, snapshot politiques |
| `queue.json` | Événements hors-ligne |
| `bin/` | Wrappers CLI (`claude.cmd`, `codex`, …) |
| `daemon.pid` / `daemon.log` | Processus heartbeat |

---

## Tests manuels

```powershell
# ALLOW
claude "Explique la différence entre REST et GraphQL en cinq lignes."

# BLOCK (exit 2, pas de spawn)
claude "Ma clé OpenAI sk-abcdefghijklmnopqrstuvwxyz012345"

# MASK (argv réécrit, stderr `[ACG MASK]`)
claude "Le n° assuré CNSS A12345678 a un impayé."

# Avec fichier
claude --file .\data\fixtures-fichiers\08-BLOCK-medical.txt "analyse ce fichier"
```

Scénarios détaillés : `docs/scenarios-e2e-texte.md` (section M-A2-*).

---

## Variables d’environnement

```powershell
$env:ACG_ENABLE_NER = "1"          # NER (sinon moteur règles rapide)
$env:NER_MODEL_PATH = "…"
$env:NER_MODEL_SHA256 = "…"
$env:NER_HUB_MODEL = "…"
$env:NER_DISABLE_HUB = "1"
$env:LLM_MODEL_PATH = "…"
$env:LLM_MODEL_SHA256 = "…"
$env:ACG_ENABLE_OCR = "0"          # désactiver OCR local (défaut = activé)
```

- `intercept` / `enroll` : moteur **fast** (règles), sauf si NER forcé via env.
- `daemon` : moteur **full** (NER possible).

---

## Cycle courant (après rebuild)

```powershell
pnpm agents:build
node apps/agent-cli/dist/cli.js stop
node apps/agent-cli/dist/cli.js install
node apps/agent-cli/dist/cli.js daemon
node apps/agent-cli/dist/cli.js status
```

---

## Décisions

| Action | Effet CLI |
|---|---|
| **ALLOW** | Spawn normal |
| **WARN** | Message stderr, puis spawn |
| **MASK** | Prompt / fichiers sanitizés (temp `acg-mask-*`), puis spawn |
| **BLOCK** | Message stderr, `exit 2`, pas de spawn |

---

## Catalogue CLI surveillé

Défini dans `packages/shared/src/domain/ai-services.ts`, synchronisé via `/v1/agents/sync`.
Exemples : `claude`, `codex`, `gemini`, `gh-copilot` / `copilot`, `aider`, `cursor-agent` / `agent`.

Après ajout d’une commande au catalogue : `install` ou nouvel `enroll`.

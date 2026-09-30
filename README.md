# AI Compliance Gateway

Passerelle **100 % TypeScript** de sécurisation des interactions entreprise ↔ IA générative (DAT v1.0). Pas de Docker.

PostgreSQL local : utilisateur `postgres` / mot de passe `postgres`.

## Démarrage

```powershell
copy .env.example .env
pnpm install
pnpm build:packages
pnpm db:create
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- API : http://localhost:4000
- Dashboard : http://localhost:3000

Comptes : `rssi@cnss.bj` / `Admin!2026` · `dpo@cnss.bj` / `Dpo!2026` · `marie.agbodji@cnss.bj` / `User!2026`

`DATABASE_URL` attendu : `postgres://postgres:postgres@localhost:5432/ai_compliance_gateway`

## Brancher les agents

Les agents A1 (extension Chrome) et A2 (shim CLI Node) partagent le même runtime : une fois le jeton collé, ils **entrent dans le pipeline** (sync des politiques, heartbeat ECDSA P-256, décision locale ALLOW/WARN/MASK/BLOCK, file hors-ligne, journal sans clair).

```powershell
pnpm agents:build
```

1. Dashboard → **Utilisateurs** : créer le collaborateur si besoin.
2. Dashboard → **Agents** → choisir le collaborateur → **Émettre un jeton (Extension + Terminal)**. Le même jeton enrôle A1 et A2 (une consommation par module).
3. **A1** : Chrome → `chrome://extensions` → Mode développeur → Charger le dossier `apps/agent-browser/dist`. Popup : coller l'URL API (`http://localhost:4000`) et le jeton → **Enrôler**. Accepter les sites du catalogue (nouveaux domaines web = pas de rebuild). L'agent intercepte Entrée, le bouton Envoyer, les **pièces jointes** (CSV, Word, Excel, PDF ; images avec `ACG_ENABLE_OCR=1` côté Node) et `fetch()` des APIs de conversation ; un MASK renvoie automatiquement le prompt jetonnné.
4. **A2** (même jeton) : coller la commande affichée, du type :

```powershell
node apps/agent-cli/dist/cli.js enroll --api http://localhost:4000 --token <jeton>
$env:Path = "$env:USERPROFILE\.acg\bin;" + $env:Path
```

L'enrôlement A2 installe les wrappers (`claude`, `codex`, `gemini`, …) dans `%USERPROFILE%\.acg\bin` **et lance un démon** (`~/.acg/daemon.pid`) qui émet le heartbeat / sync. Les intercepts CLI ne doublent plus le heartbeat. Relancer : `node apps/agent-cli/dist/cli.js daemon`. Arrêter : `node apps/agent-cli/dist/cli.js stop`.

Pour une nouvelle commande CLI, relancez `install` (ou un nouvel enroll). Pour un nouveau site web ajouté au catalogue, ouvrez la popup A1 → **Autoriser les sites du catalogue**.

ADR-005 : le shim A2 est en TypeScript/Node, pas Rust.

## NER (couche 2) et TLS

- L'API charge NER en arrière-plan (hub Xenova si `NER_MODEL_PATH` est vide). Sans `@huggingface/transformers`, la couche reste dégradée : règles + mots-clés suffisent.
- Installation optionnelle : `pnpm add @huggingface/transformers --filter @acg/detection-engine`
- Désactiver le hub : `NER_DISABLE_HUB=1`
- HTTPS local : renseigner `API_TLS_CERT` et `API_TLS_KEY`, et aligner `API_PUBLIC_URL` / `VITE_API_URL` sur `https://…`

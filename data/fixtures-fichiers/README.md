# Fixtures fichiers — index

Régénérer : `pnpm fixtures:fichiers`

Toutes les données sont **fictives**. Le préfixe du nom annonce l'action attendue ; le test `packages/agent-runtime/src/fixtures-actions.test.ts` vérifie qu'elle est tenue (direction Cotisations, risque élevé) et qu'un fichier MASK réécrit ne contient plus aucune valeur sensible.

Guides détaillés par format (ALLOW / WARN / MASK / BLOCK) :

→ [`docs/tests-fichiers-par-format/`](../../docs/tests-fichiers-par-format/README.md)

## Fichiers générés (préfixe = format + action)

| Préfixe | Exemples |
|---|---|
| `txt-` / `md-` | ALLOW procédure · MASK rappel · BLOCK médical |
| `csv-` | ALLOW thèmes · MASK assures · BLOCK secrets |
| `sql-` | ALLOW schéma · MASK backup · BLOCK credentials |
| `json-` | ALLOW menu · MASK dossier · BLOCK secrets |
| `env-` | ALLOW public · BLOCK config |
| `xlsx-` | ALLOW planning · MASK cotisations · BLOCK secrets |
| `docx-` | ALLOW note · MASK rappel · BLOCK médical |
| `pptx-` | ALLOW projet · MASK CNSS · BLOCK finance |
| `pdf-` | ALLOW guide · MASK rappel · BLOCK secrets |
| `zip-` | ALLOW docs · MASK assures · BLOCK technique |

## Test rapide Inspect

1. Ouvrir le guide du format (ex. `docs/tests-fichiers-par-format/02-csv.md`)
2. Joindre le fichier listé + coller le prompt
3. Service `chatgpt.com` → Évaluer
4. Cocher la checklist du guide

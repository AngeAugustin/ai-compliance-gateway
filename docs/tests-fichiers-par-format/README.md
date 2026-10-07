# Guides de test fichiers — actions attendues

Un document par format. Chaque guide décrit **ALLOW / WARN / MASK / BLOCK** avec le fichier fixture et le prompt à utiliser.

| Format | Guide |
|---|---|
| Texte (TXT / MD) | [01-txt-md.md](./01-txt-md.md) |
| CSV | [02-csv.md](./02-csv.md) |
| SQL | [03-sql.md](./03-sql.md) |
| JSON | [04-json.md](./04-json.md) |
| ENV | [05-env.md](./05-env.md) |
| Excel (XLSX) | [06-excel.md](./06-excel.md) |
| Word (DOCX) | [07-word.md](./07-word.md) |
| PowerPoint (PPTX) | [08-powerpoint.md](./08-powerpoint.md) |
| PDF | [09-pdf.md](./09-pdf.md) |
| ZIP | [10-zip.md](./10-zip.md) |

## Légende des actions

| Action | Effet utilisateur | Effet système |
|---|---|---|
| **ALLOW** | Aucun message, envoi tel quel | Journal possible sans clair |
| **WARN** | Bannière ambre, envoi autorisé | Journal « high » |
| **MASK** | Bannière violette, texte/fichier jetonné si réécrivable | Clair remplacé |
| **BLOCK** | Bannière rouge, **envoi refusé** | Pièce jointe annulée (A1) / exit 2 (A2) |

> **Note MASK fichier** : CSV / TXT / SQL / JSON / ENV sont réécrivables. PDF / DOCX / PPTX / XLSX / images non réécrivables → si données sensibles dans le fichier, la décision bascule souvent en **BLOCK** (politique « fichier non anonymisable »).

## Prérequis

```powershell
pnpm fixtures:fichiers   # régénère data/fixtures-fichiers/
pnpm dev                 # API + Dashboard
```

Tester via **Inspect** (recommandé) : joindre le fichier + coller le prompt + service `chatgpt.com`.

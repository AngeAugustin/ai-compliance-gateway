# Tests fonctionnels — pièces jointes

Formats supportés : **CSV, TXT, DOCX, XLSX, PDF** (texte natif ou heuristique), **images** (OCR si `ACG_ENABLE_OCR=1` + `tesseract.js` installé côté Node).

## Comportement

| Décision | Fichier |
|---|---|
| **ALLOW** | Aucune entité sensible dans prompt + extrait |
| **WARN** | Score high, envoi autorisé |
| **MASK** | CSV/TXT anonymisés localement ; PDF/image non réécrivable → **BLOCK** |
| **BLOCK** | Secret, médical, CNSS, etc. — upload annulé (A1) / exit 2 (A2) |

## Exemples Inspect (Dashboard)

| Fichier | Contenu | Attendu |
|---|---|---|
| `propre.csv` | `theme,info\nArchivage,interne` | ALLOW |
| `assures.csv` | `nom,id\ncnss A12345678` | MASK ou BLOCK |
| `secrets.csv` | `sk-abcdefghijklmnopqrstuvwxyz012345` | BLOCK |

## CLI

```powershell
claude "Analyse ce fichier" --file .\assures.csv
```

## Auto

```powershell
pnpm test:e2e:fichiers
```

# Tests fonctionnels — pièces jointes

Formats supportés :

| Famille | Extensions |
|---|---|
| Texte / données | `.txt` `.csv` `.tsv` `.sql` `.json` `.xml` `.html` `.yml` `.env` `.log` `.md` + code (`.js` `.ts` `.py`…) |
| Office | `.docx` `.doc` `.xlsx` `.xls` `.pptx` `.ppt` `.odt` `.ods` `.odp` |
| Documents | `.pdf` |
| Archives | `.zip` `.jar` (contenu analysé récursivement) |
| Images | `.png` `.jpg` `.webp`… (OCR si `ACG_ENABLE_OCR=1`) |
| Fallback | tout fichier **textuel** ou binaire via chaînes imprimables |

Pièce jointe illisible → mode dégradé / **BLOCK** selon politiques.

## Comportement

| Décision | Fichier |
|---|---|
| **ALLOW** | Aucune entité sensible dans prompt + extrait |
| **WARN** | Score high, envoi autorisé |
| **MASK** | CSV/TXT/SQL/JSON/ENV **réécrits** (jetons) avant envoi A1/A2 ; PDF/image/PPTX/XLSX/DOCX non réécrivable → **BLOCK** |
| **BLOCK** | Secret, médical, CNSS, etc. — upload annulé (A1) / exit 2 (A2) |

## Exemples Inspect

| Fichier | Contenu | Attendu |
|---|---|---|
| `propre.csv` | thème générique | ALLOW |
| `assures.csv` | `cnss A12345678` | MASK ou BLOCK |
| `backup.sql` | `INSERT … email` | MASK / WARN |
| `brief.pptx` | slide avec NPI | BLOCK (non MASK-able) ou MASK prompt |
| `bundle.zip` | `secrets.txt` avec API key | BLOCK |

## CLI

```powershell
claude "Analyse" --file .\backup.sql
claude "Lis" .\export.zip
```

## Auto

```powershell
pnpm test:e2e:fichiers
```

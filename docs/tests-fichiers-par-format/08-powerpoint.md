# Format PowerPoint (PPTX) — actions attendues

**Extraction** : XML des diapositives · **MASK-able fichier** : non → PII/secrets → **BLOCK** fréquent

---

## ALLOW

| | |
|---|---|
| **Fichier** | `pptx-ALLOW-presentation-projet.pptx` |
| **Prompt** | `Transforme ces slides en script de présentation.` |
| **Attendu** | **ALLOW** |
| **Contrôle** | Titres génériques du projet |

---

## WARN

Peu fréquent sur PPTX : un contact e-mail seul peut donner WARN/ALLOW ; dès qu’il y a CNSS / NPI / secret → MASK/BLOCK.

---

## MASK

| | |
|---|---|
| **Fichier** | `pptx-MASK-brief-cnss.pptx` |
| **Prompt** | `Rédige des notes de réunion à partir de ces slides.` |
| **Attendu** | Souvent **BLOCK** (fichier non anonymisable) plutôt qu’un vrai MASK du PPTX |
| **Contrôle** | Aucun envoi du PPTX clair vers l’IA si BLOCK |

---

## BLOCK

| | |
|---|---|
| **Fichier** | `pptx-BLOCK-brief-finance.pptx` |
| **Prompt** | `Transforme ces slides en notes.` |
| **Attendu** | **BLOCK** — NPI / IBAN / clé API |
| **Contrôle** | Bannière rouge · pièces jointes vidées côté A1 |

---

## Checklist

- [ ] ALLOW présentation projet  
- [ ] MASK/BLOCK brief CNSS  
- [ ] BLOCK brief finance  

# Format PowerPoint (PPTX) — actions attendues

**Extraction** : XML des diapositives · **MASK-able fichier** : oui (réécriture ZIP/XML des slides)

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
| **Attendu** | **MASK** — CNSS / e-mail remplacés par des jetons dans le PPTX |
| **Contrôle** | Bannière MASK · fichier réinjecté anonymisé |

---

## BLOCK

| | |
|---|---|
| **Fichier** | `pptx-BLOCK-brief-finance.pptx` (alias `11-BLOCK-brief-finance.pptx`) |
| **Prompt** | `Transforme ces slides en notes.` |
| **Attendu** | **BLOCK** — clé API (`sk-…`) prioritaire ; NPI/IBAN seuls donneraient MASK |
| **Contrôle** | Bannière rouge · pièces jointes vidées côté A1 |

---

## Checklist

- [ ] ALLOW présentation projet  
- [ ] MASK brief CNSS  
- [ ] BLOCK brief finance (avec clé API)  

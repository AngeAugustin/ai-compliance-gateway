# Format Word (DOCX) — actions attendues

**Extraction** : mammoth (texte brut) · **MASK-able fichier** : non → sensibles dans le `.docx` → souvent **BLOCK**

---

## ALLOW

| | |
|---|---|
| **Fichier** | `docx-ALLOW-note-interne.docx` |
| **Prompt** | `Améliore le ton de cette note de service.` |
| **Attendu** | **ALLOW** |
| **Contrôle** | Contenu organisationnel sans PII |

---

## WARN

| | |
|---|---|
| **Fichier** | DOCX avec un e-mail isolé |
| **Prompt** | `Corrige l'orthographe.` |
| **Attendu** | **WARN** / **ALLOW** |
| **Contrôle** | Envoi possible |

---

## MASK

| | |
|---|---|
| **Fichier** | `docx-MASK-rappel-assure.docx` |
| **Prompt** | `Améliore la rédaction de ce rappel.` |
| **Attendu** | **MASK** du prompt **ou BLOCK** du fichier (non réécrivable) |
| **Contrôle** | Pas de `CNSS A12345678` / e-mail / MoMo en clair côté IA |

---

## BLOCK

| | |
|---|---|
| **Fichier** | `docx-BLOCK-medical.docx` |
| **Prompt** | `Reformule pour le médecin conseil.` |
| **Attendu** | **BLOCK** — données médicales |
| **Contrôle** | Envoi refusé |

---

## Checklist

- [ ] ALLOW note interne  
- [ ] MASK/BLOCK rappel assuré  
- [ ] BLOCK médical  

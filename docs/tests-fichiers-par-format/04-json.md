# Format JSON — actions attendues

**Extraction** : texte natif · **MASK-able** : oui

---

## ALLOW

| | |
|---|---|
| **Fichier** | `json-ALLOW-menu.json` |
| **Prompt** | `Propose une arborescence de navigation améliorée.` |
| **Attendu** | **ALLOW** |
| **Contrôle** | Structure applicative sans PII |

---

## WARN

| | |
|---|---|
| **Fichier** | JSON avec un seul champ `email` |
| **Prompt** | `Valide ce schéma JSON.` |
| **Attendu** | **WARN** / **ALLOW** |
| **Contrôle** | Pas de fuite si MASK non déclenché — envoi autorisé |

---

## MASK

| | |
|---|---|
| **Fichier** | `json-MASK-dossier.json` |
| **Prompt** | `Rédige un mail à partir de ce dossier.` |
| **Attendu** | **MASK** (ou BLOCK si bande critique / montant + IBAN context) |
| **Contrôle** | CNSS, NPI, MoMo, e-mail jetonisés dans le texte analysé / sortant |

---

## BLOCK

| | |
|---|---|
| **Fichier** | `json-BLOCK-secrets.json` |
| **Prompt** | `Configure mon client avec ce JSON.` |
| **Attendu** | **BLOCK** — `sk-…` + chaîne `postgres://…` |
| **Contrôle** | Aucun secret dans le réseau / argv |

---

## Checklist

- [ ] ALLOW menu  
- [ ] MASK dossier  
- [ ] BLOCK secrets  

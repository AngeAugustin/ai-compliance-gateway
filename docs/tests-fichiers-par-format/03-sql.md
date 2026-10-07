# Format SQL — actions attendues

**Extraction** : texte natif · **MASK-able** : oui

---

## ALLOW

| | |
|---|---|
| **Fichier** | `sql-ALLOW-schema.sql` |
| **Prompt** | `Explique ce schéma et propose des index utiles.` |
| **Attendu** | **ALLOW** |
| **Contrôle** | DDL sans données personnelles |

---

## WARN

| | |
|---|---|
| **Fichier** | SQL avec un e-mail seul dans un commentaire |
| **Prompt** | `Commente cette requête.` |
| **Attendu** | **WARN** / **ALLOW** selon score |
| **Contrôle** | Pas de BLOCK injustifié |

---

## MASK

| | |
|---|---|
| **Fichier** | `sql-MASK-backup.sql` |
| **Prompt** | `Optimise ces INSERT sans exposer les PII.` |
| **Attendu** | **MASK** — CNSS, e-mails, téléphones jetonisés |
| **Contrôle** | Valeurs `cnss A…` / e-mails absentes du texte sortant |

---

## BLOCK

| | |
|---|---|
| **Fichier** | `sql-BLOCK-credentials.sql` |
| **Prompt** | `Exécute ces grants en production.` |
| **Attendu** | **BLOCK** — password / API key |
| **Contrôle** | Envoi refusé |

---

## Checklist

- [ ] ALLOW schéma  
- [ ] MASK dump INSERT  
- [ ] BLOCK credentials  

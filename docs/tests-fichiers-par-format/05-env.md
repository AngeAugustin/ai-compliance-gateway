# Format ENV — actions attendues

**Extraction** : texte natif · **MASK-able** : oui (mais secrets → BLOCK prioritaire)

---

## ALLOW

| | |
|---|---|
| **Fichier** | `env-ALLOW-public.env` |
| **Prompt** | `Explique ces variables d'environnement.` |
| **Attendu** | **ALLOW** |
| **Contrôle** | Uniquement noms d’app / log level |

---

## WARN

Peu pertinent : un `.env` « soft » sans secret reste souvent ALLOW. Un token faible peut monter en WARN selon score.

---

## MASK

Rare sur `.env` : dès qu’une clé API / mot de passe / connection string est détectée, la politique **secrets** (priorité 1) impose **BLOCK**, pas MASK.

---

## BLOCK

| | |
|---|---|
| **Fichier** | `env-BLOCK-config.env` |
| **Prompt** | `Configure mon .env pour la prod.` |
| **Attendu** | **BLOCK** |
| **Contrôle** | `OPENAI_API_KEY` et `DATABASE_URL` jamais transmis |

---

## Checklist

- [ ] ALLOW public  
- [ ] BLOCK config secrets  

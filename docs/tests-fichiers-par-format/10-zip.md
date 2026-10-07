# Format ZIP — actions attendues

**Extraction** : contenu des entrées analysé récursivement · **MASK-able archive** : non dans la v1

---

## ALLOW

| | |
|---|---|
| **Fichier** | `zip-ALLOW-docs.zip` |
| **Prompt** | `Que contient cette archive de documentation ?` |
| **Attendu** | **ALLOW** |
| **Contrôle** | Fichiers génériques (`readme.txt`, `notes.md`) sans PII |

---

## WARN

| | |
|---|---|
| **Fichier** | ZIP avec un TXT contenant un e-mail seul |
| **Prompt** | `Liste les fichiers et résume.` |
| **Attendu** | **WARN** / **ALLOW** |
| **Contrôle** | Envoi possible |

---

## MASK

| | |
|---|---|
| **Fichier** | `zip-MASK-export-assures.zip` |
| **Prompt** | `Analyse l'export d'assurés.` |
| **Attendu** | **MASK** du texte extrait ou **BLOCK** (archive non réécrite) |
| **Contrôle** | Numéro CNSS non transmis en clair |

---

## BLOCK

| | |
|---|---|
| **Fichier** | `zip-BLOCK-export-technique.zip` |
| **Prompt** | `Que contient cette archive ?` |
| **Attendu** | **BLOCK** — clé API dans `keys/openai.txt` |
| **Contrôle** | Refus d’envoi · message explicite |

---

## Checklist

- [ ] ALLOW docs  
- [ ] MASK/BLOCK export assures  
- [ ] BLOCK export technique  

# Format TXT / Markdown — actions attendues

**Extraction** : lecture texte native · **MASK-able** : oui  

Dossier fixtures : `data/fixtures-fichiers/`

---

## ALLOW

| | |
|---|---|
| **Fichier** | `txt-ALLOW-procedure-archivage.txt` ou `md-ALLOW-checklist-qualite.md` |
| **Prompt** | `Résume ce document en 3 points.` |
| **Attendu** | **ALLOW** — pas de bannière, envoi libre |
| **Contrôle** | Score bas · aucune entité API_KEY / CNSS / MEDICAL |

---

## WARN

| | |
|---|---|
| **Fichier** | (optionnel) TXT avec un seul e-mail, sans CNSS |
| **Prompt** | `Reformule ce mail pour jean.dupont@cnss.bj.` |
| **Attendu** | **WARN** ou **ALLOW** selon bande de risque |
| **Contrôle** | Envoi autorisé · bannière ambre si WARN |

---

## MASK

| | |
|---|---|
| **Fichier** | `txt-MASK-rappel-cnss.txt` |
| **Prompt** | `Améliore la rédaction de ce rappel.` |
| **Attendu** | **MASK** — jetons (`NUM_ASSURE_001`, `EMAIL_001`…) |
| **Contrôle** | Plus de `A12345678` ni d’e-mail en clair dans le texte sortant |

---

## BLOCK

| | |
|---|---|
| **Fichier** | `txt-BLOCK-medical.txt` |
| **Prompt** | `Reformule pour le médecin conseil.` |
| **Attendu** | **BLOCK** — politique données médicales |
| **Contrôle** | Aucun envoi · bannière rouge |

Variante secrets : TXT contenant `sk-abcdefghijklmnopqrstuvwxyz012345` → **BLOCK**.

---

## Checklist

- [ ] ALLOW silencieux  
- [ ] MASK jetonne CNSS/e-mail  
- [ ] BLOCK médical refuse l’envoi  

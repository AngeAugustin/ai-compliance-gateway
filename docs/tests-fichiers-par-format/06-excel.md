# Format Excel (XLSX) — actions attendues

**Extraction** : cellules → texte · **MASK-able fichier** : non (souvent **BLOCK** si entités dans le classeur)

---

## ALLOW

| | |
|---|---|
| **Fichier** | `xlsx-ALLOW-planning.xlsx` |
| **Prompt** | `Résume ce planning d'activités.` |
| **Attendu** | **ALLOW** |
| **Contrôle** | Activités génériques, pas d’identifiants |

---

## WARN

| | |
|---|---|
| **Fichier** | Classeur avec un e-mail seul |
| **Prompt** | `Extrais la liste des contacts.` |
| **Attendu** | **WARN** / **ALLOW** |
| **Contrôle** | Envoi autorisé si pas de règle plus sévère |

---

## MASK

| | |
|---|---|
| **Fichier** | `xlsx-MASK-cotisations.xlsx` |
| **Prompt** | `Fais un résumé des cotisations.` |
| **Attendu** | **MASK** sur le prompt si possible, **sinon BLOCK** car XLSX non réécrit automatiquement |
| **Contrôle** | Si BLOCK : message « fichier non anonymisable » · si MASK : jetons dans le prompt uniquement |

---

## BLOCK

| | |
|---|---|
| **Fichier** | `xlsx-BLOCK-secrets.xlsx` |
| **Prompt** | `Importe ces secrets dans mon vault.` |
| **Attendu** | **BLOCK** (secrets, prio max) |
| **Contrôle** | Clé `sk-…` et password non transmis |

---

## Checklist

- [ ] ALLOW planning  
- [ ] MASK/BLOCK cotisations selon moteur  
- [ ] BLOCK secrets  

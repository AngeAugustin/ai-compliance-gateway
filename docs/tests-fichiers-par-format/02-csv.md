# Format CSV — actions attendues

**Extraction** : texte natif · **MASK-able** : oui (réécriture locale)

---

## ALLOW

| | |
|---|---|
| **Fichier** | `csv-ALLOW-themes.csv` |
| **Prompt** | `Propose une synthèse de ces thèmes.` |
| **Attendu** | **ALLOW** |
| **Contrôle** | Pas de bannière · colonnes génériques sans PII |

---

## WARN

| | |
|---|---|
| **Fichier** | CSV avec une seule colonne e-mail (sans CNSS / secret) |
| **Prompt** | `Trie ces contacts par domaine.` |
| **Attendu** | **WARN** possible si bande high, sinon ALLOW |
| **Contrôle** | Envoi OK |

---

## MASK

| | |
|---|---|
| **Fichier** | `csv-MASK-assures.csv` |
| **Prompt** | `Analyse ce fichier d'assurés.` |
| **Attendu** | **MASK** — numéros CNSS / e-mails jetonisés |
| **Contrôle** | Payload / argv sans `A12345678` · fichier CSV peut être réécrit localement |

---

## BLOCK

| | |
|---|---|
| **Fichier** | `csv-BLOCK-secrets.csv` |
| **Prompt** | `Importe ces clés dans mon script.` |
| **Attendu** | **BLOCK** — secrets techniques |
| **Contrôle** | Envoi refusé · clés jamais transmises à l’IA |

---

## Checklist

- [ ] ALLOW thèmes  
- [ ] MASK assures  
- [ ] BLOCK secrets  

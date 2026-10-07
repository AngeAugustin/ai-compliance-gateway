# Format PDF — actions attendues

**Extraction** : texte PDF (heuristique / pdfjs) · **MASK-able fichier** : non → sensibles → souvent **BLOCK**

---

## ALLOW

| | |
|---|---|
| **Fichier** | `pdf-ALLOW-guide.pdf` |
| **Prompt** | `Fais un résumé utilisateur de ce guide.` |
| **Attendu** | **ALLOW** |
| **Contrôle** | Guide sans identifiant |

---

## WARN

| | |
|---|---|
| **Fichier** | PDF avec un e-mail seul |
| **Prompt** | `Extrais les contacts.` |
| **Attendu** | **WARN** / **ALLOW** |
| **Contrôle** | Envoi autorisé si pas de règle plus sévère |

---

## MASK

| | |
|---|---|
| **Fichier** | `pdf-MASK-rappel.pdf` |
| **Prompt** | `Extrais les infos clés.` |
| **Attendu** | **MASK** prompt ou **BLOCK** fichier (PDF non réécrit) |
| **Contrôle** | Pas de CNSS / e-mail en clair transmis |

---

## BLOCK

| | |
|---|---|
| **Fichier** | `pdf-BLOCK-secrets.pdf` |
| **Prompt** | `Utilise cette clé dans mon client.` |
| **Attendu** | **BLOCK** |
| **Contrôle** | `sk-…` bloquée |

> PDF scanné (image seule) : extraction dégradée ; département Cotisations/Finance/Juridique → fail-closed **BLOCK** possible.

---

## Checklist

- [ ] ALLOW guide  
- [ ] MASK/BLOCK rappel  
- [ ] BLOCK secrets  

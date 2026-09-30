# Prompts de tests fonctionnels — texte

Prompts réalistes qu’un agent CNSS pourrait taper dans ChatGPT / Claude / Gemini / CLI,  
avec le **comportement attendu** après `pnpm db:seed` (politiques par défaut).

**Comment tester**
1. Dashboard → **Inspection d’un prompt** (rapide, sans agent), ou  
2. Extension A1 / shim A2 enrôlés pour Marie (`marie.agbodji@cnss.bj`).

**Légende**
| Action | Signification |
|---|---|
| **ALLOW** | Envoi autorisé tel quel |
| **WARN** | Envoi autorisé + alerte / journalisation renforcée |
| **MASK** | Envoi avec données sensibles remplacées par des jetons (`NUM_ASSURE_001`…) |
| **BLOCK** | Envoi refusé ; le clair ne part pas |

---

## 1. ALLOW — prompts sans fuite

### F-ALLOW-01 · Question juridique générale
```
Peux-tu m'expliquer la différence entre un contrat à durée déterminée et un CDI
en droit du travail béninois ?
```
| Attendu | **ALLOW** |
| Pourquoi | Aucune donnée personnelle / financière / technique |
| Vérifier | Pas de bannière BLOCK/MASK ; message part intact |

### F-ALLOW-02 · Aide rédaction interne
```
Aide-moi à structurer un compte-rendu de réunion d'équipe en 5 puces,
sans citer de noms ni de chiffres.
```
| Attendu | **ALLOW** |
| Pourquoi | Demande générique |

### F-ALLOW-03 · Formation / pédagogie
```
Quelles sont les missions principales d'une caisse de sécurité sociale
en Afrique de l'Ouest ? Réponds de façon pédagogique.
```
| Attendu | **ALLOW** |

### F-ALLOW-04 · Technique sans secret
```
Quelles bonnes pratiques REST recommandes-tu pour une API de consultation
en lecture seule ? Pas de code avec des credentials.
```
| Attendu | **ALLOW** |

### F-ALLOW-05 · Reformulation neutre
```
Reformule ce message de façon plus courtoise :
« Merci de bien vouloir transmettre le dossier manquant avant vendredi. »
```
| Attendu | **ALLOW** |

---

## 2. BLOCK — secrets techniques (priorité max)

### F-BLOCK-01 · Clé API OpenAI
```
Ma clé OpenAI sk-abcdefghijklmnopqrstuvwxyz012345 ne marche plus,
peux-tu vérifier la config du client ?
```
| Attendu | **BLOCK** |
| Politique | Bloquer les secrets techniques |
| Vérifier | Envoi empêché ; clé absente du journal Dashboard |

### F-BLOCK-02 · Mot de passe serveur
```
Le mot de passe = SuperSecret99! du compte admin postgres,
comment faire une rotation propre sans coupure ?
```
| Attendu | **BLOCK** |
| Entité | PASSWORD |

### F-BLOCK-03 · Chaîne de connexion
```
Voici la chaîne postgres://cnss:P@ssw0rd@10.0.0.5:5432/cotisations —
génère un script de backup pg_dump.
```
| Attendu | **BLOCK** |
| Entité | CONNECTION_STRING |

### F-BLOCK-04 · Clé privée SSH / TLS
```
J'ai cette clé pour le serveur :
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF7PZgGq6EXAMPLEKEYMATERIALONLY
-----END RSA PRIVATE KEY-----
Peux-tu m'aider à la convertir en format OpenSSH ?
```
| Attendu | **BLOCK** |
| Entité | PRIVATE_KEY |

### F-BLOCK-05 · Token GitHub
```
Mon token GitHub ghp_abcdefghijklmnopqrstuvwx1234567890ABC a expiré,
génère la commande gh auth login adaptée.
```
| Attendu | **BLOCK** |
| Entité | API_KEY |

### F-BLOCK-06 · Secret + donnée métier (priorité BLOCK)
```
Pour l'assuré CNSS A12345678 j'utilise la clé sk-abcdefghijklmnopqrstuvwxyz012345
sur l'environnement de prod. Comment sécuriser ça ?
```
| Attendu | **BLOCK** (pas MASK) |
| Pourquoi | Politique secrets (priority 1) gagne sur CNSS (priority 12) |

---

## 3. BLOCK — données médicales

### F-BLOCK-07 · Diagnostic patient
```
Le diagnostic : diabète de type 2 non contrôlé du patient doit rester confidentiel.
Reformule pour le médecin conseil CNSS.
```
| Attendu | **BLOCK** |
| Politique | Bloquer les données médicales |

### F-BLOCK-08 · Ordonnance / dossier médical
```
Voici l'ordonnance : metformine 850 mg 2x/jour + suivi HbA1c trimestriel.
Rédige une note pour le dossier médical de l'assuré.
```
| Attendu | **BLOCK** |
| Entité | MEDICAL |

### F-BLOCK-09 · Pathologie nommée
```
La pathologie : hypertension artérielle sévère a été déclarée au médecin du travail.
Prépare un courrier administratif.
```
| Attendu | **BLOCK** |

---

## 4. MASK — identifiants CNSS / nationaux

### F-MASK-01 · Numéro d’assuré
```
Le n° assuré CNSS A12345678 a un impayé. Rédige un rappel courtois
pour régularisation sous 15 jours.
```
| Attendu | **MASK** |
| Politique | Identifiants CNSS |
| Texte sortant | `A12345678` → jeton type `NUM_ASSURE_001` ; le reste du mail reste lisible |

### F-MASK-02 · Autre numéro assuré
```
Peux-tu analyser le compte CNSS B99887766 et proposer un échéancier
de paiement sur 3 mois ?
```
| Attendu | **MASK** |
| Clair masqué | `B99887766` |

### F-MASK-03 · NPI / identifiant national
```
Vérifie le dossier de l'assuré NPI : BJ19880312A45 avant de répondre
au bénéficiaire par téléphone.
```
| Attendu | **MASK** |
| Clair masqué | `BJ19880312A45` |

### F-MASK-04 · Matricule employeur
```
Le n° employeur EMP99771 a déclaré des cotisations incomplètes pour mars.
Rédige une mise en demeure type.
```
| Attendu | **MASK** (si détection EMPLOYER) ou **WARN/ALLOW** selon score |
| Note | Motif `n° employeur` / `employeur cnss` requis pour la règle |

### F-MASK-05 · Contexte conservé après masquage
```
Envoyer le rappel pour l'assuré CNSS A12345678 concernant les cotisations
du trimestre.
```
| Attendu | **MASK** |
| Vérifier | Mots « cotisations » et « trimestre » toujours présents ; pas de `A12345678` |

---

## 5. MASK — finance / mobile money (souvent + service US)

### F-MASK-06 · Virement IBAN + montant
```
Rédige un virement de 2 500 000 FCFA vers FR7630006000011234567890189
pour les cotisations du mois.
```
| Attendu | **MASK** (parfois **BLOCK** si score critique) |
| Clair masqué | montant + IBAN |
| Pourquoi | Montant financier + hébergement IA hors BJ |

### F-MASK-07 · Mobile Money
```
Envoie 80 000 FCFA via MoMo 01 97 12 34 56 à l'assuré pour régularisation
de cotisation.
```
| Attendu | **MASK**, **WARN** ou **BLOCK** selon score |
| Clair masqué (si MASK) | `80 000` et `01 97 12 34 56` |

### F-MASK-08 · Salaire + e-mail
```
Le salaire brut : 450 000 FCFA de Koffi Mensah (koffi.mensah@cnss.bj)
doit figurer dans la simulation de cotisation. Aide-moi à formuler.
```
| Attendu | **MASK** / **WARN** / **BLOCK** |
| Entités | SALARY, EMAIL (éventuellement PERSON) |

---

## 6. MASK — combinaison de quasi-identifiants

### F-MASK-09 · E-mail + téléphone + date de naissance
```
Contacte Marie Agbodji (marie.agbodji@cnss.bj) au +229 01 97 12 34 56,
née le 12/03/1988, pour finaliser son dossier RH.
```
| Attendu | **MASK** (idéalement) |
| Pourquoi | ≥ 3 quasi-identifiants → politique ré-identification |
| Clair masqué | au minimum l’e-mail |

### F-MASK-10 · Coordonnées employé
```
Pour la fiche agent : jean.dupont@cnss.bj, téléphone +229 01 90 11 22 33,
né le 05/11/1990. Génère un paragraphe d'accueil intranet.
```
| Attendu | **MASK** / **WARN** |
| Clair masqué (si MASK) | e-mail et téléphone |

---

## 7. WARN — exposition notable sans blocage

### F-WARN-01 · E-mail seul
```
Peux-tu reformuler ce mail pour jean.dupont@cnss.bj concernant
la réunion de lundi ?
```
| Attendu | **WARN**, **ALLOW** ou parfois **MASK** |
| Pourquoi | Une seule entité ; score souvent moderate/high → WARN si bande high |

### F-WARN-02 · Organisation + fonction
```
Le Directeur des cotisations de la CNSS du Bénin souhaite un discours
de 2 minutes pour l'ouverture du séminaire. Propose un plan.
```
| Attendu | **ALLOW** ou **WARN** |
| Pourquoi | Peu d’identifiants directs ; contexte organisationnel |

---

## 8. Cas limites / pièges

### F-EDGE-01 · Faux IBAN
```
Le code produit FR76-DEMO-XXXX n'est pas un vrai IBAN bancaire.
Explique la structure d'un IBAN français.
```
| Attendu | **ALLOW** (pas de MASK IBAN) |
| Pourquoi | Validateur IBAN rejette le faux numéro |

### F-EDGE-02 · Mention « mot de passe » sans valeur
```
Rappelle-moi les bonnes pratiques pour choisir un mot de passe robuste
en entreprise, sans exemple réel.
```
| Attendu | **ALLOW** |
| Pourquoi | Pas d’affectation `mot de passe = …` |

### F-EDGE-03 · Prompt vide de sens sensible
```
   
```
| Attendu | Pas de crash ; pas de BLOCK fantôme |
| Tester | Inspect / A1 avec espaces seulement |

### F-EDGE-04 · Secret prioritaire sur CNSS
```
Assuré CNSS C55443322 — password = TempPass2026! pour le portail RH.
Comment onboarding ?
```
| Attendu | **BLOCK** |
| Pourquoi | PASSWORD > MASK CNSS |

---

## 9. Grille de campagne rapide (copie-colle Inspect)

Tester dans l’ordre ; cocher si OK.

| # | ID | Action attendue | OK ? |
|---|---|---|---|
| 1 | F-ALLOW-01 | ALLOW | ☐ |
| 2 | F-ALLOW-03 | ALLOW | ☐ |
| 3 | F-BLOCK-01 | BLOCK | ☐ |
| 4 | F-BLOCK-02 | BLOCK | ☐ |
| 5 | F-BLOCK-03 | BLOCK | ☐ |
| 6 | F-BLOCK-07 | BLOCK | ☐ |
| 7 | F-BLOCK-06 | BLOCK (pas MASK) | ☐ |
| 8 | F-MASK-01 | MASK | ☐ |
| 9 | F-MASK-03 | MASK | ☐ |
| 10 | F-MASK-05 | MASK + contexte | ☐ |
| 11 | F-MASK-06 | MASK (ou BLOCK) | ☐ |
| 12 | F-MASK-07 | MASK/WARN/BLOCK | ☐ |
| 13 | F-MASK-09 | MASK (idéalement) | ☐ |
| 14 | F-WARN-01 | WARN/ALLOW | ☐ |
| 15 | F-EDGE-01 | ALLOW | ☐ |
| 16 | F-EDGE-02 | ALLOW | ☐ |
| 17 | F-EDGE-04 | BLOCK | ☐ |

Suite auto (sous-ensemble déterministe) :

```powershell
pnpm test:e2e:texte
```

---

## 10. Comportement UX attendu par action

| Action | A1 (navigateur) | A2 (CLI) | Dashboard |
|---|---|---|---|
| ALLOW | Envoi normal | Exit 0 | Événement ALLOW (optionnel) |
| WARN | Envoi + éventuel avertissement | Message `[ACG WARN]` | Événement WARN |
| MASK | Bannière + **renvoi auto** du prompt jetonné | `[ACG MASK]` + argv réécrit | Types d’entités, **pas de clair** |
| BLOCK | Bannière rouge, **pas d’envoi** | Exit code **2** | Événement BLOCK + politique |

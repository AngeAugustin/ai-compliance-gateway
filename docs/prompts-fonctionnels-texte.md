# Prompts fonctionnels — comportement attendu (texte)

Catalogue de **prompts réalistes** qu’un agent CNSS pourrait taper dans ChatGPT / Claude / Gemini / CLI.  
À tester via **Dashboard → Inspection d’un prompt** (le plus simple) ou via l’agent A1/A2.

Prérequis : `pnpm db:seed` + `pnpm dev` · compte RSSI pour Inspect · service cible souvent `chatgpt.com` (hébergé US).

Légende des décisions :
- **ALLOW** — envoi tel quel, journalisation éventuelle
- **WARN** — envoi autorisé avec avertissement / journal « high »
- **MASK** — envoi du texte **anonymisé** (jetons `NUM_ASSURE_001`, `EMAIL_001`…) ; le clair ne doit plus apparaître
- **BLOCK** — **aucun envoi** vers l’IA

Suite auto alignée : `pnpm test:e2e:texte`

---

## 1. ALLOW — prompts sans donnée sensible

| ID | Prompt à coller | Attendu | Pourquoi |
|---|---|---|---|
| F-ALLOW-01 | `Explique en trois points le rôle d'une caisse de sécurité sociale en Afrique de l'Ouest.` | **ALLOW** | Aucune entité structurée |
| F-ALLOW-02 | `Rédige un modèle de compte-rendu de réunion d'équipe, sans noms ni chiffres.` | **ALLOW** | Texte générique |
| F-ALLOW-03 | `Quelles sont les bonnes pratiques pour archiver des dossiers administratifs papier ?` | **ALLOW** | Pas d’identifiant |
| F-ALLOW-04 | `Compare REST et GraphQL pour une API de consultation de référentiels.` | **ALLOW** | Technique sans secret |
| F-ALLOW-05 | `Propose une checklist qualité avant la mise en production d'un module de reporting.` | **ALLOW** | Pas de credential |

**Contrôle** : pas de bannière BLOCK/MASK · score bas · politique vide ou non bloquante.

---

## 2. BLOCK — secrets techniques (priorité max)

| ID | Prompt à coller | Attendu | Clair qui ne doit **jamais** partir |
|---|---|---|---|
| F-BLOCK-01 | `Voici ma clé OpenAI sk-abcdefghijklmnopqrstuvwxyz012345, configure mon script Node.` | **BLOCK** | `sk-abcdefghijklmnopqrstuvwxyz012345` |
| F-BLOCK-02 | `Le mot de passe = CnssAdmin#2026! du compte postgres, comment le rotationner proprement ?` | **BLOCK** | `CnssAdmin#2026!` |
| F-BLOCK-03 | `Chaîne de prod : postgres://cnss:P@ssw0rd@10.0.0.5:5432/cotisations — génère un backup pg_dump.` | **BLOCK** | URL `postgres://…` |
| F-BLOCK-04 | `api_key: sk-ant-abcdefghijklmnopqrstuvwxyz0123456789 pour Claude, aide-moi à l'appeler.` | **BLOCK** | clé `sk-ant-…` |
| F-BLOCK-05 | `-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg…fake…\n-----END PRIVATE KEY-----\nPeux-tu me dire à quoi sert cette clé ?` | **BLOCK** | bloc PRIVATE KEY (si détecté) |
| F-BLOCK-06 | `password: S3cretVault!! pour le vault HashiCorp, écris la commande login.` | **BLOCK** | `S3cretVault!!` |

**Contrôle** : envoi **refusé** · politique « Bloquer les secrets techniques » · aucun événement avec la clé en clair.

---

## 3. BLOCK — données médicales

| ID | Prompt à coller | Attendu | Entité |
|---|---|---|---|
| F-BLOCK-07 | `Le diagnostic : hypertension artérielle sévère du patient doit rester confidentiel. Reformule pour le médecin conseil CNSS.` | **BLOCK** | MEDICAL |
| F-BLOCK-08 | `Voici l'ordonnance : metformine 1000 mg matin et soir pendant 90 jours. Résume les interactions médicamenteuses.` | **BLOCK** | MEDICAL |
| F-BLOCK-09 | `Le dossier médical : suite d'AVC ischémique en 2024, invalidité partielle. Aide-moi à rédiger l'avis.` | **BLOCK** | MEDICAL |

**Contrôle** : politique « Bloquer les données médicales » · pas d’envoi.

---

## 4. MASK — identifiants CNSS / nationaux

| ID | Prompt à coller | Attendu | Doit disparaître du texte envoyé |
|---|---|---|---|
| F-MASK-01 | `Le n° assuré CNSS A12345678 a un impayé de cotisations. Rédige un rappel courtois.` | **MASK** | `A12345678` → jeton type `NUM_ASSURE_001` |
| F-MASK-02 | `Analyse le compte CNSS B99887766 et propose un échéancier de paiement sur 6 mois.` | **MASK** | `B99887766` |
| F-MASK-03 | `Pour l'employeur CNSS E4455667, génère une lettre de mise en demeure type.` | **MASK** | `E4455667` (si motif employeur détecté) |
| F-MASK-04 | `Vérifie le dossier de l'assuré NPI : BJ19880312A45 avant de répondre au bénéficiaire.` | **MASK** | `BJ19880312A45` |
| F-MASK-05 | `L'assuré CNSS C77889900 a changé d'adresse. Propose un mail de confirmation sans jargon.` | **MASK** | `C77889900` |
| F-MASK-06 | `Envoyer le rappel pour l'assuré CNSS A12345678 concernant les cotisations du trimestre.` | **MASK** | `A12345678` · le mot « cotisations » doit **rester** |

**Contrôle** : bannière MASK · Network/payload **sans** le numéro · contexte métier conservé.

---

## 5. MASK — finance / mobile money (souvent + risque high)

| ID | Prompt à coller | Attendu | Doit disparaître si MASK |
|---|---|---|---|
| F-MASK-07 | `Rédige un virement de 2 500 000 FCFA vers FR7630006000011234567890189 pour les cotisations du mois.` | **MASK** (ou BLOCK si bande critique) | montant + IBAN |
| F-MASK-08 | `Envoie 80 000 FCFA via MoMo 01 97 12 34 56 à l'assuré pour régularisation.` | **MASK** / **WARN** / **BLOCK** | montant + numéro MoMo |
| F-MASK-09 | `Prépare l'ordre de virement de 15 000 000 FCFA vers FR7630006000011234567890189 (cotisations employeurs).` | **MASK** / **BLOCK** | montant + IBAN |
| F-MASK-10 | `Le salaire net 450 000 FCFA de l'agent doit être confirmé. Rédige la note pour la paie.` | **MASK** / **WARN** | montant / salaire selon détection |

**Contrôle** : avec `chatgpt.com` (US) + user BJ, la règle « finance hors juridiction » pousse souvent vers MASK quand bande ≥ high.

---

## 6. MASK — combinaison de quasi-identifiants (ré-identification)

| ID | Prompt à coller | Attendu | Clair sensible |
|---|---|---|---|
| F-MASK-11 | `Contacte Marie Agbodji (marie.agbodji@cnss.bj) au +229 01 97 12 34 56, née le 12/03/1988, pour le dossier RH.` | **MASK** (ou WARN) | e-mail, téléphone, date |
| F-MASK-12 | `Fiche agent : Koffi Mensah, koffi.mensah@cnss.bj, téléphone +229 01 90 11 22 33, né le 05/11/1975. Rédige sa fiche synthétique.` | **MASK** / **WARN** | e-mail + téléphone + date |

**Contrôle** : ≥ 3 quasi-identifiants → politique « Combinaison de quasi-identifiants ».

---

## 7. WARN — exposition notable sans secret ni ID direct fort

| ID | Prompt à coller | Attendu | Commentaire |
|---|---|---|---|
| F-WARN-01 | `Peux-tu reformuler ce mail pour jean.dupont@cnss.bj concernant la réunion de lundi ?` | **WARN**, **ALLOW** ou **MASK** | 1 e-mail seul → souvent WARN/ALLOW selon score |
| F-WARN-02 | `Aide-moi à écrire un message à la Direction à propos du retard sur le projet SIG-Cotisations.` | **ALLOW** ou **WARN** | Peu d’entités ; peut rester ALLOW |
| F-WARN-03 | `Voici l'IP du serveur applicatif 10.12.34.56, comment la mettre dans un firewall UFW ?` | **WARN** / **ALLOW** / **MASK** | IP interne = signal technique |

**Contrôle** : si WARN → envoi OK + journal ; pas de jetons obligatoires.

---

## 8. Priorité des politiques (cas pièges)

| ID | Prompt à coller | Attendu | Pourquoi |
|---|---|---|---|
| F-PRIO-01 | `L'assuré CNSS A12345678 et ma clé sk-abcdefghijklmnopqrstuvwxyz012345 — résume le dossier.` | **BLOCK** | Secrets (prio 1) battent MASK CNSS |
| F-PRIO-02 | `Diagnostic : diabète gestationnel. Assuré CNSS A12345678. Rédige la note.` | **BLOCK** | Médical (prio 2) avant MASK CNSS |
| F-PRIO-03 | `mot de passe = TempPass123 et virement 500 000 FCFA vers MoMo 01 97 12 34 56` | **BLOCK** | Password prioritaire |

---

## 9. Variantes métier CNSS (campagne rapide)

À enchaîner dans Inspect pour une démo / soutenance (~10 min) :

1. F-ALLOW-01 → ALLOW  
2. F-BLOCK-01 → BLOCK  
3. F-MASK-01 → MASK (jeton)  
4. F-MASK-07 → MASK  
5. F-BLOCK-07 → BLOCK médical  
6. F-PRIO-01 → BLOCK (pas MASK)  
7. F-MASK-11 → MASK / WARN  
8. F-ALLOW-04 → ALLOW  

**Succès campagne** : 8/8 comportements conformes · aucun clair secret/CNSS/médical observé dans un envoi autorisé.

---

## 10. Comment vérifier concrètement

### Inspect (recommandé)
1. Connexion `rssi@cnss.bj`  
2. Page **Inspection d’un prompt**  
3. Coller le prompt · service `chatgpt.com` · **Évaluer**  
4. Lire badge ALLOW/WARN/MASK/BLOCK + nom de politique  

### Agent A1
Même prompt dans ChatGPT → bannière + (MASK) payload sans clair.

### Agent A2
```powershell
claude "Le n° assuré CNSS A12345678 a un impayé. Rédige un rappel."
```
MASK → `[ACG MASK]` · BLOCK → exit code 2.

### Auto
```powershell
pnpm test:e2e:texte
```

Les IDs `F-*` déterministes sont aussi couverts (ou dérivés) dans `packages/agent-runtime/src/e2e-texte.scenarios.ts`.

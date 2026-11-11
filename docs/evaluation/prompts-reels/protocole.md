# Évaluation sur des prompts réels anonymisés

Le corpus d'évaluation est synthétique : les 65 prompts manuels ont été écrits pour ressembler à des demandes d'agents de la CNSS, mais personne ne les a réellement envoyés. Cette évaluation vérifie que les résultats tiennent sur des **formulations réelles**.

Un prompt réel d'agent de la CNSS contient, par nature, des données personnelles d'assurés : noms, numéros, pathologies, salaires. Leur collecte est un **traitement de données personnelles**. Elle demande l'accord préalable du DPO, et doit respecter la loi béninoise n° 2017-20 (Code du numérique, livre V) et le RGPD si des données de résidents européens sont concernées.

## 1. Principe : on garde la formulation, jamais la donnée

Chaque prompt collecté est **pseudonymisé à la main avant toute annotation et avant toute sortie du poste de collecte**. Chaque valeur sensible est remplacée par une valeur fictive **de même forme** :

| Donnée réelle | Remplacée par |
| :--- | :--- |
| Nom et prénom | Un nom fictif de même origine et de même longueur approximative |
| Numéro d'assuré, NPI, IFU, IBAN, carte | Un numéro fictif valide au même format (clé de contrôle respectée) |
| Adresse, quartier | Un quartier fictif de la même ville |
| Montant, salaire | Un montant du même ordre de grandeur |
| Pathologie | Une pathologie de même gravité |
| Clé, mot de passe | Une valeur aléatoire de même format |

La passerelle elle-même ne sert **pas** à pseudonymiser : on mesurerait alors le moteur sur ce qu'il sait déjà trouver, et les données qu'il manque resteraient en clair.

## 2. Collecte

- **Autorisation** : note du DPO validant la finalité (évaluation du dispositif), la durée de conservation (fin du projet), les personnes habilitées (collecteur et deux annotateurs).
- **Volontariat** : agents volontaires de 4 directions au moins (Prestations, Cotisations, Finance, Informatique), informés par écrit. Chacun soumet des demandes qu'il a réellement faites ou voulu faire à un service d'IA.
- **Taille visée** : 150 à 200 prompts. Avec moins de 100, l'intervalle de confiance du rappel par type est trop large pour conclure.
- **Équilibre** : au moins 20 % de prompts sans aucune donnée sensible, pour mesurer les fausses alertes.
- **Support** : un poste isolé, sans connexion à un service d'IA, chiffré. Les prompts originaux (avant pseudonymisation) sont détruits dès la pseudonymisation vérifiée par une seconde personne.

## 3. Annotation

- Format : celui du second annotateur ([guide-annotation.md](../annotation/guide-annotation.md)), avec la catégorie de contexte après l'identifiant :
  ```
  ### reel-001 Finance
  Fais le virement de [[FINANCIAL_AMOUNT|350 000]] FCFA à [[PERSON|Afi Kpodo]] sur [[MOBILE_MONEY|01 96 45 22 10]].
  ```
- Le fichier est enregistré sous `docs/evaluation/prompts-reels/corpus-annote.txt`. Il ne contient **que des valeurs fictives**. Il peut être versionné après accord du DPO ; sinon, il reste hors du dépôt.
- Deux annotateurs indépendants. L'accord se mesure comme pour le corpus manuel ; les désaccords sont arbitrés avant la mesure.

## 4. Mesure

```bash
pnpm eval:prompts-reels
```

Le script ([prompts-reels.ts](../../../tools/eval/prompts-reels.ts)) applique le moteur complet et le moteur sans NER, avec les mêmes métriques que le corpus synthétique (précision, rappel, F1 avec intervalle de confiance, rappel protection, entités encore lisibles après masquage, données manquées). Il écrit [prompts-reels.md](../resultats/prompts-reels.md). `pnpm eval:prompts-reels --exemple` vérifie le script sur le corpus manuel. Sans réseau, le téléchargement du NER bloque : donner le modèle local (`NER_MODEL_PATH=models/ner-browser NER_DISABLE_HUB=1`).

## 5. Objectifs fixés avant la mesure

Ce sont des hypothèses tant que la collecte n'a pas eu lieu.

| Mesure | Objectif | Justification |
| :--- | :--- | :--- |
| Rappel protection du moteur complet | ≥ 75 % | Au plus 5 points sous le corpus manuel (80,4 %), le plus proche de l'usage réel : au-delà, le corpus synthétique surestime nettement la protection |
| F1 partiel | ≥ 75 % | Comparable au corpus manuel (78,2 %), le plus proche de l'usage réel |
| Secrets techniques (clés, mots de passe, chaînes de connexion) | 100 % détectés | Ce sont les données dont la fuite est la plus grave et les plus régulières |

## 6. Limites

- Des prompts écrits en sachant qu'ils seront analysés sont plus soignés que l'usage spontané.
- La pseudonymisation à la main peut rendre une valeur plus « propre » que l'originale (faute de frappe corrigée, format normalisé) : consigne de reproduire les irrégularités.

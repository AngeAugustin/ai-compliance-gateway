# Protocole d'évaluation de la détection

Ce document décrit comment on mesure la qualité du moteur de détection (`packages/detection-engine`) : sur quelles données, avec quelles métriques, et ce que les chiffres permettent — ou non — d'affirmer. Les résultats chiffrés sont dans [resultats/resultats-detection.md](resultats/resultats-detection.md), régénérés par :

```bash
pnpm eval:detection
```

Variante rapide sans chargement du modèle NER (≈ 10 s) :

```bash
pnpm eval:detection:rapide
```

Options : `--sans-ner`, `--repetitions <n>` (3), `--graine <n>` (2026), `--taille-genere <n>` (300), `--longs <n>` (20), `--reid <n>` (50 par variante), `--sortie <dossier>`. Même graine ⇒ même corpus, mêmes scénarios ; seules les latences varient d'une exécution à l'autre.

## 1. Questions posées

1. **Qualité** — quelle part des données sensibles le moteur trouve-t-il (rappel), et à quel prix en fausses alertes (précision) ? Par type d'entité et par couche.
2. **Apport de chaque couche** — que gagne-t-on en ajoutant le NER aux règles ? Que vaut le mode dégradé (NER non chargé) ?
3. **Coût** — quelle latence ajoute la détection, selon la longueur du prompt ?
4. **Protection effective** — après masquage, une personne reste-t-elle identifiable par recoupement ?

## 2. Corpus

| Sous-corpus | Taille | Origine | Rôle |
| :--- | ---: | :--- | :--- |
| Manuel | 65 prompts | Écrits à la main ([data/eval/corpus-manuel.ts](../../data/eval/corpus-manuel.ts)) | Formulations réalistes et variées : fautes, casse, anglais, négatifs difficiles |
| Généré | 300 prompts | Gabarits ([tools/eval/corpus-genere.ts](../../tools/eval/corpus-genere.ts)) remplis depuis une population synthétique | Volume et couverture de tous les types |
| Multi-demandes | 20 documents | Plusieurs gabarits concaténés (300–900 et 1 500–4 000 caractères) | Latence par longueur, découpage du NER |

Toutes les données personnelles sont **synthétiques** : population de 2 000 personnes fictives ([tools/eval/population.ts](../../tools/eval/population.ts)) — noms et communes béninois, numéros mobiles au plan 01XX, NPI à 10 chiffres, IBAN béninois à clé valide (mod 97), cartes Visa valides (Luhn), employeurs inventés. Aucun prompt ne provient de journaux de production.

Les **négatifs** (prompts sans donnée sensible) et **négatifs difficiles** (montant réglementaire, IP publique de documentation, numéro de commande à 8 chiffres, nom d'institution…) mesurent les fausses alertes, qui coûtent en utilisabilité.

### Annotation

Annotation en ligne `⟦TYPE|valeur⟧` ; les positions `[début, fin)` sont calculées par le parseur ([tools/eval/annotation.ts](../../tools/eval/annotation.ts)), ce qui supprime les erreurs d'offset manuelles. Conventions :

- on annote **la valeur seule**, sans libellé ni unité (`IBAN ⟦IBAN|BJ…⟧`, `⟦SALARY|185 000⟧ F`) ;
- `PERSON` sans civilité (`Mme ⟦PERSON|Grâce Dossou⟧`) ;
- `ADDRESS` = lieu de résidence d'une personne (quartier, commune), pas un lieu cité en passant ;
- `JOB_TITLE` = fonction d'une personne identifiée, pas un métier en général ;
- `ORGANIZATION` = employeur ou entreprise ; jamais la CNSS elle-même (contexte de l'outil) ;
- `MEDICAL` = la pathologie ou l'acte, pas le mot « malade » ;
- `SALARY` = salaire, prime ou cotisation d'une personne ou d'un employeur ; `FINANCIAL_AMOUNT` = tout autre montant ;
- `TAX_ID` = IFU ; `NATIONAL_ID` = NPI, CIP, passeport.

Un seul annotateur : l'accord inter-annotateurs n'est pas mesuré (voir § 8).

## 3. Configurations comparées (ablation)

| Id | Configuration | Contenu |
| :--- | :--- | :--- |
| `regles` | Règles seules | Couche 1 (regex + validateurs), sortie brute |
| `ner` | NER seul | Couche 2, `bert-base-multilingual-cased-ner-hrl` quantifié (PER/LOC/ORG → PERSON/ADDRESS/ORGANIZATION) |
| `moteur-degrade` | Moteur sans NER | `DetectionEngine` de production sans NER : règles + mots-clés + réglages (seuils, renfort par le contexte) |
| `moteur-complet` | Moteur complet | `DetectionEngine` + NER : la configuration de production |

Chaque configuration a un **périmètre déclaré** (types qu'elle sait produire). Les types hors périmètre comptent comme faux négatifs dans les totaux — c'est ce que vit l'utilisateur — mais le rapport donne aussi le F1 restreint au périmètre, qui mesure la qualité intrinsèque de la couche.

La couche 3 (classification du contexte) est évaluée à part : lexiques (repli) et, si `LLM_MODEL_PATH` pointe vers un modèle GGUF, le LLM local.

## 4. Métriques

### Appariement

Prédictions et annotations sont appariées **un à un**, glouton par recouvrement (IoU) décroissant ([tools/eval/metrics.ts](../../tools/eval/metrics.ts)), selon trois modes :

| Mode | Vrai positif si… | Usage |
| :--- | :--- | :--- |
| Strict | même type et mêmes bornes | Qualité de segmentation |
| Partiel | même type et chevauchement | **Mesure principale** (comparable à SemEval-2013 « type ») |
| Protection | chevauchement, quel que soit le type | Ce qui compte pour le masquage : une donnée masquée sous un autre type reste protégée |

### Scores

- Précision, rappel, F1 en **micro-moyenne** sur toutes les entités ; **macro-F1** sur les types présents dans le corpus.
- Conventions : P = 1 sans prédiction, R = 1 sans annotation.
- **Intervalle de confiance à 95 %** du F1 par bootstrap (1 000 rééchantillonnages, graine fixe) sur les **prompts** : les entités d'un même prompt ne sont pas indépendantes, le prompt est l'unité statistique.
- Ventilation par sous-corpus et par type ; liste des faux positifs les plus fréquents.

### Masquage

Pour chaque entité annotée, on applique `applyMasking` aux prédictions et on compte les caractères visibles encore en clair : **entièrement masquée**, **partiellement** (fuite d'une partie de la valeur, ex. le nom sans le prénom) ou **pas du tout**.

### Contexte

Exactitude, macro-F1 et matrice de confusion sur les prompts étiquetés (les documents multi-demandes, multi-thèmes, sont exclus).

### Latence

Temps de `detect()` mesuré en processus avec `performance.now()`, après 5 appels d'échauffement non chronométrés (JIT, sessions ONNX), `--repetitions` mesures par prompt. On rapporte p50 / p95 / p99, moyenne, maximum, débit, et p50 / p95 par tranche de longueur (< 200, 200–1 000, > 1 000 caractères). Le temps de chargement du modèle NER est rapporté à part : il n'est payé qu'une fois par processus. Ce temps exclut le réseau, l'API et l'évaluation de politique.

## 5. Expérience de ré-identification

Objectif : vérifier que le masquage **protège réellement les personnes**, au-delà d'un score de détection. Une donnée non détectée n'a pas le même coût selon qu'elle suffit ou non à retrouver quelqu'un.

**Modèle de menace** (défavorable au défenseur) : l'attaquant lit le prompt tel qu'il sort de la passerelle (côté fournisseur d'IA, ou en cas de fuite de ses journaux) et possède le **registre complet** des 2 000 assurés : nom, prénom, sexe, date de naissance, commune, quartier, téléphone, e-mail, NPI, n° d'assuré, IBAN, employeur, fonction. C'est l'attaque par recoupement de Sweeney (2002) : on cherche dans le texte chaque valeur d'attribut du registre et on ne garde que les personnes compatibles ([tools/eval/reidentification.ts](../../tools/eval/reidentification.ts)). Les attributs sont appliqués du plus discriminant au moins discriminant ; un recoupement qui éliminerait tout le monde (homonymie, coïncidence) est ignoré ; l'accord grammatical (« née », « Mme ») filtre sur le sexe.

**Scénarios** (50 par variante, cible tirée dans le registre) :

| Variante | Contenu du prompt |
| :--- | :--- |
| `direct` | Nom complet, fonction, employeur, date de naissance, quartier et commune |
| `quasi-identifiants` | Pas de nom : fonction, employeur, date de naissance, commune |
| `identifiants` | N° d'assuré et téléphone |
| `contact` | Nom complet, e-mail, commune |

**Mesures**, pour le texte en clair puis pour chaque configuration : taux de **ré-identification** (un seul candidat et c'est la cible), taux de **k ≤ 5** (la cible est parmi au plus 5 candidats), **k médian** (taille de l'ensemble d'anonymat).

Les quasi-identifiants seuls suffisent souvent à ré-identifier : c'est la raison d'être de la politique `quasi_identifier_count` côté passerelle, que cette expérience ne mesure pas (elle mesure la détection et le masquage seuls).

## 6. Reproductibilité

- Générateur pseudo-aléatoire à graine (mulberry32, [tools/eval/rng.ts](../../tools/eval/rng.ts)) ; flux séparés pour la population, le corpus généré, les documents longs et les scénarios.
- Le rapport inscrit la date, la graine, la version de Node, la plateforme, le processeur et l'état du NER / LLM.
- Sortie Markdown lisible et JSON complet (`resultats-detection.json`) pour retraiter les chiffres.
- Tests du protocole lui-même ([tests/eval/protocole.test.ts](../../tests/eval/protocole.test.ts)) : parseur, appariement dans les trois modes, conventions P/R/F1, déterminisme du bootstrap, validité des IBAN et cartes du corpus, reproductibilité du générateur, et contrôle de l'attaque (réussite en clair, échec après masquage total).

## 7. Lecture des résultats

- Comparer les configurations sur le **même** corpus et en **partiel** ; le strict pénalise des écarts de bornes sans conséquence pour la protection.
- Un écart de F1 n'est significatif que si les intervalles de confiance ne se chevauchent pas nettement.
- Le **rappel protection** et la **fuite au masquage** sont les indicateurs de sécurité ; la **précision** est l'indicateur d'utilisabilité (une fausse alerte masque une information utile ou bloque un prompt légitime).
- Les scores sur le corpus généré sont optimistes : les gabarits sont réguliers. Le corpus manuel est la référence pour la généralisation.

## 8. Limites

- **Données synthétiques** : formulations moins variées que l'usage réel ; aucune garantie sur la distribution réelle des types. Une évaluation sur prompts réels anonymisés reste à faire.
- **Un seul annotateur**, pas de mesure d'accord (kappa) ; certaines frontières (ADDRESS vs lieu cité, SALARY vs FINANCIAL_AMOUNT, IFU en `TAX_ID` alors que le moteur le range en `NATIONAL_ID`) relèvent de conventions. Le mode protection neutralise ces désaccords de type.
- **Taille** : quelques dizaines d'occurrences pour certains types (clé privée, mot de passe) ; leurs scores par type ont une grande variance.
- **Attaquant simplifié** : correspondance exacte de valeurs, pas d'inférence floue ni de connaissance externe (réseaux sociaux) ; registre fermé de 2 000 personnes, bien plus petit qu'une base d'assurés réelle — moins de collisions, donc une ré-identification par quasi-identifiants *plus facile* qu'en réalité : les taux sont pessimistes pour le défenseur.
- **Latence** mesurée sur une seule machine, sans charge concurrente.
- Le LLM local n'est évalué que si un modèle est disponible.

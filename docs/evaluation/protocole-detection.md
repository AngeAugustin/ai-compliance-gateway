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

Exactitude, macro-F1 et matrice de confusion sur les prompts étiquetés (les documents multi-demandes, multi-thèmes, sont exclus), plus l'exactitude **par corpus**.

Les lexiques de repli (version 2) ont été réglés en n'examinant que les erreurs du **corpus généré**. Le **corpus manuel n'a pas été regardé** pendant le réglage : son exactitude est la mesure honnête de généralisation, le score sur le généré est optimiste par construction. Version 1 → version 2 : généré 80,0 % → 97,7 %, manuel 56,9 % → 61,5 %. Les erreurs restantes du manuel sont surtout des prompts sans terme métier explicite (« annoncer qu'elle n'a pas été retenue », « ma clé ne doit pas fuiter ») : une limite de toute approche par lexique, que la couche LLM est censée combler.

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

Les quasi-identifiants seuls suffisent souvent à ré-identifier : c'est la raison d'être du facteur de risque « combinaison de quasi-identifiants » et de la politique `quasi_identifier_count`. Cette expérience mesure la détection et le masquage seuls ; l'expérience suivante mesure la décision.

### 5 bis. Réponse du scoring au risque de ré-identification

Objectif : vérifier que le facteur « combinaison de quasi-identifiants » (poids 25 %) **relève la bande de risque** des prompts qui désignent effectivement une personne, et que la décision qui en résulte les protège ([tools/eval/risk-response.ts](../../tools/eval/risk-response.ts)).

**Méthode.** Mêmes scénarios que ci-dessus, plus **100 témoins peu exposés** (50 par variante) pour disposer d'un point de comparaison : `temoin-commune` (une commune seule, environ 130 assurés par commune) et `temoin-fonction` (fonction et commune, une dizaine d'assurés). Pour chaque scénario :

1. **Exposition en clair** : l'attaque appliquée au texte original classe le scénario en *ré-identifiable* (k = 1, c'est la cible), *quasi ré-identifiable* (2 ≤ k ≤ 5) ou *peu exposé* (k > 5). C'est la vérité terrain du risque.
2. **Décision** : pipeline de l'agent (score de risque → politiques équivalentes au seed, dont la règle « identifiant direct → MASK » ajoutée après la première mesure → masquage → escalade MASK → BLOCK si au moins 2 quasi-identifiants restent après masquage), pour un utilisateur d'une direction à risque modéré écrivant à ChatGPT (hébergé hors juridiction).
3. **Sortie réelle** : l'attaquant voit rien si BLOCK, le texte masqué si MASK, le texte en clair si ALLOW ou WARN.

**Ablation.** Même pipeline avec le poids du facteur à 0 et les trois autres renormalisés (somme = 1). La différence de bandes et d'actions isole la contribution du facteur ; la politique `quasi_identifier_count ≥ 3` reste active dans les deux cas.

**Mesures**, par classe d'exposition : score moyen, valeur moyenne du facteur, répartition des bandes et des actions, **taux laissé en clair** (ALLOW ou WARN) et **taux encore ré-identifié après la passerelle**. Le résultat attendu : score et bande croissants avec l'exposition, et aucun scénario ré-identifiable laissé en clair.

### 5 ter. Délai d'alerte « agent manquant » (NFR-03)

Mesure de bout en bout, à part de la détection (`pnpm eval:heartbeat`, [tools/eval/heartbeat-latency.ts](../../tools/eval/heartbeat-latency.ts)), contre l'API et la base réelles, avec leurs réglages réels. 20 agents simulés sont inscrits comme à l'enrôlement et envoient de vrais signaux signés toutes les 60 s, chacun avec sa propre phase. Chacun est désactivé à un instant tiré au hasard ; on mesure le temps jusqu'à l'alerte `AGENT_MISSING`, toutes les dates venant de l'horloge de la base. Résultats : [heartbeat-latence.md](resultats/heartbeat-latence.md). L'API doit tourner pendant la mesure (environ 8 minutes).

## 6. Reproductibilité

- Générateur pseudo-aléatoire à graine (mulberry32, [tools/eval/rng.ts](../../tools/eval/rng.ts)) ; flux séparés pour la population, le corpus généré, les documents longs et les scénarios.
- Le rapport inscrit la date, la graine, la version de Node, la plateforme, le processeur et l'état du NER / LLM.
- Sortie Markdown lisible et JSON complet (`resultats-detection.json`) pour retraiter les chiffres.
- Tests du protocole lui-même ([tests/eval/protocole.test.ts](../../tests/eval/protocole.test.ts)) : parseur, appariement dans les trois modes, conventions P/R/F1, déterminisme du bootstrap, validité des IBAN et cartes du corpus, reproductibilité du générateur, et contrôle de l'attaque (réussite en clair, échec après masquage total), classement de l'exposition, texte vu par l'attaquant selon l'action, et activation du facteur quasi-identifiants avec un détecteur oracle.

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

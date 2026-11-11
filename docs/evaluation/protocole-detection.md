# Protocole d'évaluation de la détection

> Vue d'ensemble de tous les résultats (mesurés et objectifs restant à vérifier) : [synthese-resultats.md](synthese-resultats.md).

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

Un seul annotateur à ce jour. Le kit pour un second annotateur indépendant est prêt : [guide-annotation.md](annotation/guide-annotation.md), fichier à annoter `pnpm eval:accord export`, calcul de l'accord (F1 strict, F1 protection, kappa de Cohen par caractère, désaccords) `pnpm eval:accord`, testé dans [accord-annotateurs.test.ts](../../tests/eval/accord-annotateurs.test.ts).

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

**LLM local** (Phi-3.5-mini Q4_K_M, CPU, réponse contrainte par grammaire ; [résultats](resultats/avec-llm/resultats-detection.md), passe sans NER) : exactitude 57,5 % contre 91,2 % pour les lexiques, mais le classement s'inverse sur le **corpus manuel**, le seul honnête : **73,8 % (48/65) contre 61,5 % (40/65)**. Sur le généré (54,0 %), les erreurs tiennent à peu de gabarits répétés et souvent ambigus : les prompts « génériques » parlent d'agents, de formations, de notes de service, de médailles du travail (48 classés RH) ; les « médicaux » d'accident du travail, d'arrêt de travail, de courrier à l'employeur (29 classés RH). Le modèle tire nettement vers RH dans un corpus d'administration. Coût : environ 3 s par prompt sur ce processeur (21 min pour 365 prompts), contre moins d'une milliseconde pour les lexiques. Conclusion : le LLM généralise mieux que les lexiques aux formulations sans terme métier, mais pas assez ni assez vite pour les remplacer ; il ne pèse que sur le facteur contexte (15 % du score), jamais sur la détection des entités.

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

**Profils.** L'effet d'un facteur dépend de la distance aux seuils de bande, donc du reste du score. Les tableaux détaillés portent sur le profil de référence ; l'ablation est en plus rejouée sur 12 profils (direction à risque faible, modéré ou élevé × service hébergé au Bénin, dans l'UE, aux États-Unis ou en Chine) et comparée scénario par scénario : bandes et actions modifiées, sens du changement, écart de score exposés − témoins, ré-identifiables encore exploitables.

**Ablation.** Même pipeline avec le poids du facteur à 0 et les trois autres renormalisés (somme = 1). La différence de bandes et d'actions isole la contribution du facteur ; la politique `quasi_identifier_count ≥ 3` reste active dans les deux cas.

**Mesures**, par classe d'exposition : score moyen, valeur moyenne du facteur, répartition des bandes et des actions, **taux laissé en clair** (ALLOW ou WARN) et **taux encore ré-identifié après la passerelle**. Le résultat attendu : score et bande croissants avec l'exposition, et aucun scénario ré-identifiable laissé en clair.

### 5 ter. Délai d'alerte « agent manquant » (NFR-03)

Mesure de bout en bout, à part de la détection (`pnpm eval:heartbeat`, [tools/eval/heartbeat-latency.ts](../../tools/eval/heartbeat-latency.ts)), contre l'API et la base réelles, avec leurs réglages réels. 20 agents simulés sont inscrits comme à l'enrôlement et envoient de vrais signaux signés toutes les 60 s, chacun avec sa propre phase. Chacun est désactivé à un instant tiré au hasard ; on mesure le temps jusqu'à l'alerte `AGENT_MISSING`, toutes les dates venant de l'horloge de la base. Résultats : [heartbeat-latence.md](resultats/heartbeat-latence.md). L'API doit tourner pendant la mesure (environ 8 minutes).

**Fausses alertes** (`pnpm eval:heartbeat:fausses-alertes`, [tools/eval/heartbeat-fausses-alertes.ts](../../tools/eval/heartbeat-fausses-alertes.ts)). Seconde moitié de H4 : 35 agents simulés restent actifs 600 s, bien au-delà du seuil, en 7 profils de 5 : signal régulier ; période allongée de 0 à 20 s (alarme Chrome, poste chargé) ; coupure réseau de 2, 3 ou 4 signaux perdus d'affilée ; 4 signaux perdus avec la période allongée ; et un témoin mis en veille 7 minutes, qui doit être alerté puis signalé rétabli. Une alerte sur un agent hors témoin est une fausse alerte. Le script s'arrête si une itération dure plus de 10 s (mise en veille du poste de mesure) : une première exécution invalidée ainsi a été écartée. Résultats : [heartbeat-fausses-alertes.md](resultats/heartbeat-fausses-alertes.md). Aucune alerte tant que l'écart entre deux signaux reste sous le seuil (jusqu'à 4 signaux perdus, 300 s) ; les 5 agents du profil « 4 perdus + période allongée » sont alertés, avec des écarts réels de 332 à 353 s : l'agent vivait, mais il est resté muet plus longtemps que le seuil. Le témoin est alerté puis rétabli dans les 5 cas.

### 5 quater. Décision de bout en bout et charge

`pnpm eval:charge` ([tools/eval/decision-charge.ts](../../tools/eval/decision-charge.ts)), sur une base jetable `…_charge` (le journal d'audit est en ajout seul ; le script refuse toute autre base). Un vrai agent est enrôlé par le parcours réel, intercepte les 29 scénarios texte E2E cinq fois, et l'on vérifie le journal (même action, même ordre, séquestre de chaque MASK, chaîne). Puis des agents rejouent en parallèle les requêtes signées, par paliers de 1 à 50. Résultats sans NER : [decision-charge-sans-ner.md](resultats/decision-charge-sans-ner.md). Une première mesure a révélé que la chaîne d'audit cassait sous concurrence : le serveur lisait le dernier hachage puis insérait sans verrou, et dès 5 agents simultanés, 23 797 événements sur 32 536 déclaraient un mauvais prédécesseur. Correctif ([event-chain.ts](../../apps/api/src/evaluate/event-chain.ts)) : lecture et insertion dans une transaction tenant un verrou consultatif propre à la chaîne. Après correctif : 0 rupture sur 30 043 événements, pour un débit maximal ramené d'environ 400 à 350 requêtes/s.

**Avec NER** ([decision-charge.md](resultats/decision-charge.md)) : le téléchargement du modèle complet depuis le hub bloquant sur le réseau, `NER_MODEL_PATH` accepte désormais un dossier de modèle local ([ner-onnx.ts](../../packages/detection-engine/src/layers/ner-onnx.ts)) ; la mesure utilise `models/ner-browser`, le modèle quantifié de l'extension (chargé en 5 s, sans réseau). Bout en bout : 145/145 interactions journalisées, mêmes actions dans le même ordre, 0 divergence, 55/55 séquestres, 0 rupture de chaîne ; décision locale p50 53 ms (1 ms sans NER), temps total attendu par l'utilisateur p50 75 ms, p95 151 ms. Charge : 0 erreur jusqu'à 50 agents, 11 258 événements, 0 rupture ni bifurcation de chaîne, débit plafonné vers 130 requêtes/s. Ce plafond ne se compare pas aux 350 requêtes/s ci-dessus : le poste était chargé à 65 % hors mesure, et un témoin sans NER relancé dans la même session plafonne à 168 requêtes/s ([decision-charge-sans-ner-temoin.json](resultats/decision-charge-sans-ner-temoin.json)). En charge, le serveur n'exécute pas le NER (les requêtes rejouées sont déjà décidées), et les deux passes visaient la même instance de l'API : l'écart entre elles (130 contre 168) n'est pas imputable au NER mais à la charge variable du poste. Le coût du NER est côté poste, sur la décision locale.

Les tests hors ligne ([offline.test.ts](../../packages/agent-runtime/src/offline.test.ts)) ont révélé deux défauts de la file de l'agent : un événement refusé définitivement (400) restait en tête et bloquait tous les suivants, et une réponse perdue après écriture faisait journaliser l'événement deux fois au renvoi. Correctifs : la file retire les refus définitifs (400, 404, 409, 413, 422) en les comptant, espace les nouvelles tentatives (backoff de 1 à 30 s) ; le serveur reconnaît l'`interactionId` déjà journalisé (migration 0009, contrôle sous le verrou de la chaîne) et renvoie l'événement existant. Vérifié sur la base jetable ([tools/eval/idempotence-check.ts](../../tools/eval/idempotence-check.ts)) : un renvoi séquentiel et cinq renvois simultanés du même événement donnent chacun un seul événement journalisé.

### 5 quater bis. Extension dans un vrai navigateur

`pnpm test:e2e:extension` ([extension.e2e.ts](../../apps/agent-browser/e2e/extension.e2e.ts)) : Chromium piloté par Playwright charge l'extension compilée sur une page de discussion simulée servie à l'adresse https://chatgpt.com/ ; avec `ACG_E2E_API` et une base `…_charge`, l'extension est en plus enrôlée auprès de l'API réelle. 10/10 : envoi anodin, blocage d'un secret (touche Entrée, bouton, appel direct du script de la page), Maj+Entrée, pièces jointes (secrète retirée, anodine intacte), masquage (le service d'IA ne reçoit que le jeton, la page ne voit jamais la valeur, restituée dans un panneau à Shadow DOM fermé) et journalisation. Le test a révélé un défaut : après un MASK, le prompt masqué renvoyé par la page était réévalué et journalisé une seconde fois (ALLOW). Corrigé dans [content.ts](../../apps/agent-browser/src/content.ts) : le texte masqué que l'agent vient d'écrire est reconnu et n'est plus réanalysé ; le journal contient désormais exactement une décision par interaction.

### 5 quater ter. Tableau de bord

`pnpm test:e2e:dashboard` ([dashboard.e2e.ts](../../apps/dashboard/e2e/dashboard.e2e.ts)) : Chromium contre le serveur Vite du tableau de bord et l'API réelle sur la base jetable, comptes du seed, double authentification activée par le vrai parcours (code TOTP calculé comme par une application d'authentification). 16/16 : mot de passe faux refusé sans session ; page protégée renvoyée vers la connexion ; aucun accès d'administration pour un collaborateur ; MFA activée en base ; les 8 pages du RSSI s'affichent sans erreur JavaScript ni refus de l'API ; le journal montre les événements de la base ; session effacée → retour à la connexion ; le DPO voit la vue d'ensemble et le journal, lit les politiques (contrôle de conformité) mais ne peut ni les modifier ni accéder aux utilisateurs. Non couvert : l'utilisabilité, qui demande des utilisateurs réels. Le protocole est prêt : [utilisabilite/protocole.md](utilisabilite/protocole.md) (9 tâches RSSI et DPO, critères de réussite, questionnaire SUS, consentement), dépouillement `pnpm eval:utilisabilite`, testé dans [utilisabilite.test.ts](../../tests/eval/utilisabilite.test.ts).

### 5 quinquies. Extraction de fichiers

`pnpm eval:extraction` ([tools/eval/extraction-fichiers.ts](../../tools/eval/extraction-fichiers.ts)) : le corpus manuel est écrit dans des fichiers produits par des outils tiers, puis on mesure la part des valeurs annotées conservées et la détection sur le texte extrait comparée au texte source. Résultats : [extraction-fichiers.md](resultats/extraction-fichiers.md). L'automatisation de Word se bloquant sur ce poste, DOCX, XLSX, PPTX et PDF ont été produits par des bibliothèques tierces indépendantes du projet ([tools/eval/fichiers-bibliotheques.ts](../../tools/eval/fichiers-bibliotheques.ts) : docx, SheetJS, pptxgenjs, pdf-lib) ; les images par System.Drawing. DOCX, XLSX et PPTX conservent 100 % des valeurs (97/97) ; le PDF texte 99,0 % (96/97), la seule perte étant un jeton JWT coupé sur deux lignes par la mise en page, comme le ferait Word ; le PDF scanné (10 pages d'images, OCR) 94,7 % ; les images seules (OCR) 95,9 %, avec 3 secrets sur 4 valeurs perdues. La détection sur le PDF texte est la même que sur le DOCX (45,4 %).

**Défaut trouvé puis corrigé : l'extraction PDF échouait en silence.** Avant correction, un PDF texte ordinaire (flux compressés) ne rendait que 436 caractères inexploitables (0/97 valeur) et un PDF scanné n'était pas soumis à l'OCR ; dans les deux cas l'extraction n'était marquée ni en échec ni dégradée, si bien que le mode dégradé de l'agent ([index.ts](../../packages/agent-runtime/src/index.ts)) ne pouvait pas s'appliquer. Cause : `pdfjs-dist`, prévu par l'extracteur, n'était pas installé, et le repli heuristique ne lisait que les chaînes non compressées. Correction ([pdf.ts](../../packages/file-extract/src/extractors/pdf.ts), [engine.ts](../../packages/file-extract/src/engine.ts), [sanitize.ts](../../packages/file-extract/src/sanitize.ts)) :
- `pdfjs-dist` installé : lecture des flux compressés et des polices encodées ;
- les images incorporées d'une taille utile passent à l'OCR (un seul worker tesseract pour tout le document), y compris sur une page qui contient aussi du texte ;
- un PDF sans texte lisible est en **échec explicite** ; une extraction partielle (pages au-delà de la limite, images non lues, repli heuristique) est **dégradée**, avec la raison ; le repli heuristique écarte un résultat qui ne ressemble pas à du texte ;
- au masquage, le PDF réécrit est relu : si une valeur y reste lisible, ou si une partie du texte venait de l'OCR, le fichier est reconstruit à partir du texte masqué au lieu d'être renvoyé.
Tests : [pdf.test.ts](../../packages/file-extract/src/pdf.test.ts) (flux compressés, PDF corrompu, limite de pages, PDF scanné avec et sans OCR, masquage vérifié par relecture).

**Secrets lus par l'OCR.** L'OCR restitue mal 3 des 4 clés des images (caractères confondus l/1/I et 0/O, tirets longs, jeton coupé en fin de ligne), d'où 95,9 % de valeurs conservées. Mais la fidélité n'est pas la protection : une clé lue avec un caractère faux garde sa forme et reste détectée, donc bloquée. Deux défauts empêchaient pourtant la détection, corrigés dans [ocr.ts](../../packages/file-extract/src/extractors/ocr.ts) : les tirets typographiques (« ——---BEGIN RSA PRIVATE KEY ») sont ramenés à « - », et un jeton coupé en fin de ligne est recollé lorsque les deux morceaux ressemblent à un jeton. Le recollage s'applique aussi au texte natif des PDF, où la mise en page coupe les longues clés. Le rapport ajoute la colonne « Secrets détectés » : clé d'API, clé privée, mot de passe ou chaîne de connexion détecté dans l'extrait, même lu à quelques caractères près (similarité ≥ 0,8). Résultat : **100 % (8/8) dans tous les formats**, images et PDF scanné compris. Seuls 8 secrets sont annotés : c'est un contrôle, pas une estimation précise. Tests : [ocr-normalize.test.ts](../../packages/file-extract/src/ocr-normalize.test.ts), sur le texte réellement produit par tesseract.

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
- **Un seul annotateur**, pas encore de mesure d'accord (kit prêt : [guide-annotation.md](annotation/guide-annotation.md), `pnpm eval:accord`) ; certaines frontières (ADDRESS vs lieu cité, SALARY vs FINANCIAL_AMOUNT, IFU en `TAX_ID` alors que le moteur le range en `NATIONAL_ID`) relèvent de conventions. Le mode protection neutralise ces désaccords de type.
- **Taille** : quelques dizaines d'occurrences pour certains types (clé privée, mot de passe) ; leurs scores par type ont une grande variance.
- **Attaquant simplifié** : correspondance exacte de valeurs, pas d'inférence floue ni de connaissance externe (réseaux sociaux) ; registre fermé de 2 000 personnes, bien plus petit qu'une base d'assurés réelle — moins de collisions, donc une ré-identification par quasi-identifiants *plus facile* qu'en réalité : les taux sont pessimistes pour le défenseur.
- **Latence** de détection mesurée sur une seule machine ; la charge (§ 5 quater) l'est aussi sur une seule machine, API, base et agents confondus, et son débit dépend de la charge du poste au moment de la mesure (350 puis 130 à 168 requêtes/s selon la session).
- **Extraction** : les fichiers bureautiques de mesure sont produits par des bibliothèques, pas par Office (automatisation de Word bloquée sur ce poste) ; mise en forme simple. Des fichiers enregistrés à la main depuis Word, Excel et PowerPoint dans `data/eval/fichiers-office/office/` sont mesurés à part, sans autre réglage ([LISEZMOI.md](../../data/eval/fichiers-office/office/LISEZMOI.md)) ; cette mesure reste à faire. Un secret coupé par un retour à la ligne dans un PDF n'est pas reconstitué. Le PDF reconstruit au masquage est une page de texte simple, tronquée à 500 caractères : sûr, mais la mise en forme et la fin du document sont perdues.
- **Utilisabilité** du tableau de bord non évaluée : les tests vérifient qu'il fonctionne, pas qu'il est facile à utiliser. Protocole et dépouillement prêts ([utilisabilite/protocole.md](utilisabilite/protocole.md)), séances à conduire avec 5 à 8 participants.
- Le LLM local a été évalué une fois (Phi-3.5-mini, CPU, sans NER) ; son score sur le corpus généré dépend fortement de l'étiquetage de quelques gabarits ambigus, seul le corpus manuel (65 prompts) mesure la généralisation, avec un intervalle large.

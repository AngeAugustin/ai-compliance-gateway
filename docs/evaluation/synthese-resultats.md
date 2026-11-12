# Synthèse des résultats — AI Compliance Gateway

Document de référence pour le mémoire et la soutenance. Chaque chiffre porte un statut :

- **Mesuré** : obtenu par un script reproductible, rapport détaillé en lien ;
- **Non réalisé** : validation conçue (protocole, objectifs fixés à l'avance, script de calcul testé) mais pas menée, faute de participants dans un projet conduit seul ; c'est une perspective, pas un résultat.

Protocole complet : [protocole-detection.md](protocole-detection.md).

## 1. En une page

| Question | Réponse | Statut |
| :--- | :--- | :--- |
| Le moteur trouve-t-il les données sensibles ? | F1 **90,6 %** (IC 95 % : 89,1–92,1 %), rappel protection **93,5 %**, sur 385 prompts et 976 entités | Mesuré |
| Que reste-t-il de lisible après masquage ? | **6,5 %** des entités, dont 44 sur 63 sont des fonctions / postes, hors périmètre de détection | Mesuré |
| Peut-on encore identifier la personne ? | Ré-identification **99,5 % → 2,0 %** ; taille médiane du groupe de candidats 1 → 77 | Mesuré |
| Le blocage ralentit-il l'utilisateur ? | **75 ms** en médiane, 151 ms au p95, décision et journalisation comprises | Mesuré |
| Le serveur tient-il la charge ? | **0 erreur** jusqu'à 50 agents simultanés, environ 130 req/s sur un portable chargé ; chaîne d'audit intacte sur 11 258 événements ; 20 vrais agents : 0 erreur sur 17 927 interactions | Mesuré |
| Et sur un réseau lent ? | Le délai suit le réseau : 333 ms en médiane avec 300 ms d'aller-retour, mêmes décisions | Mesuré |
| Que se passe-t-il si la détection tombe ? | Directions à risque bloquées (politique, puis filet du code) ; 15 tests | Mesuré |
| Les fichiers joints sont-ils lus ? | **100 %** des valeurs en DOCX, XLSX et PPTX ; 99 % en PDF ; **100 % des secrets** détectés dans tous les formats, images comprises ; mêmes taux pour les fichiers enregistrés par Microsoft Office | Mesuré |
| Les agents désactivés sont-ils repérés ? | Alerte **5 min 10 s** en médiane après le dernier signal ; aucune fausse alerte jusqu'à 4 signaux perdus ; vrais agents : signal toutes les 60 s, 0 alerte en 15 min | Mesuré |
| L'extension marche-t-elle sur les vrais sites ? | **8 sites sur 8 conformes** (blocage, masquage, fichiers, journal), après correction d'un défaut de bannière révélé par le vrai ChatGPT | Mesuré |
| Les résultats tiennent-ils sur des prompts réels ? | Non mesuré : collecte soumise à l'accord du DPO et à des volontaires. Le corpus manuel (65 prompts écrits à la main) en tient lieu : F1 76,8 % | Non réalisé |
| Le tableau de bord est-il facile à utiliser ? | Non mesuré : demande 5 à 8 participants. Le fonctionnement est vérifié (16 tests de bout en bout), pas la facilité d'usage | Non réalisé |
| L'annotation est-elle fiable ? | Sur ce qui serait masqué, oui : F1 protection **90,1 %**, kappa **0,836** ; sur le type et les bornes exacts, F1 strict **71,4 %**, sous l'objectif de 80 % | Mesuré |

## 2. Détection des données sensibles — mesuré

Rapport : [resultats-detection.md](resultats/resultats-detection.md) (`pnpm eval:detection`, graine 2026). Corpus : 65 prompts écrits à la main, 300 générés, 20 documents longs ; 976 entités annotées (référence arbitrée par deux annotateurs, [arbitrage.csv](annotation/arbitrage.csv)) ; 104 prompts sans donnée sensible.

| Configuration | Précision | Rappel | F1 (IC 95 %) | Rappel protection | Latence p50 / p95 |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Règles seules | 96,5 % | 50,8 % | 66,6 % (63,8–68,9 %) | 52,4 % | 0,36 / 2,11 ms |
| NER seul | 78,5 % | 40,5 % | 53,4 % (50,7–56,1 %) | 42,6 % | 96,3 / 326 ms |
| **Moteur complet** | **90,1 %** | **91,2 %** | **90,6 % (89,1–92,1 %)** | **93,5 %** | 99,6 / 370 ms |

- Les couches se complètent : les règles couvrent les identifiants structurés (IBAN, numéros CNSS, clés : 100 %), le NER les noms, organisations et adresses (noms : 97 %).
- Corpus manuel, le plus proche de l'usage réel : F1 **76,8 %**, plus bas que sur le corpus généré (92,8 %), dont les gabarits sont réguliers. Le manuel est la référence pour la généralisation.
- Données encore lisibles après la passerelle : **6,5 %** des entités. La principale cause est connue : les fonctions et postes ne sont pas détectés (44 entités sur 63).

### Ré-identification

Un attaquant dispose du registre complet (2 000 assurés fictifs) et du prompt tel qu'il sort de la passerelle.

| Configuration | Personnes ré-identifiées | Taille médiane du groupe de candidats |
| :--- | ---: | ---: |
| Sans passerelle | 99,5 % | 1 |
| Règles seules | 64,0 % | 1 |
| **Moteur complet** | **2,0 %** | **77** |

### Classification du contexte

| Méthode | Corpus manuel | Corpus global | Coût |
| :--- | ---: | ---: | :--- |
| Lexiques (en production) | 61,5 % | 91,2 % | < 1 ms |
| LLM local seul (Phi-3.5-mini, CPU) | 73,8 % | 57,5 % | environ 3 s par prompt |
| Moteur avec LLM (contexte final) | 76,9 % | 71,2 % | 3,0 s médiane, 4,2 s p95 |

Le LLM généralise mieux sur les formulations libres : combiné aux lexiques, il donne le meilleur score sur le corpus manuel. Mais il dégrade le score global de 20 points : quand il contredit les lexiques, le moteur le suit le plus souvent, même à tort (98 erreurs retenues sur 168 désaccords). Il ajoute aussi 3 s par prompt. Les lexiques restent la méthode par défaut. Rapports : [avec-llm/resultats-detection.md](resultats/avec-llm/resultats-detection.md), [llm-pipeline.md](resultats/llm-pipeline.md).

## 3. Décision de bout en bout et charge — mesuré

Rapport : [decision-charge.md](resultats/decision-charge.md) (`pnpm eval:charge`, moteur complet avec NER).

- **Un agent réel**, enrôlé par le parcours normal, 145 interactions (29 scénarios × 5) :
  - temps vu par l'utilisateur : médiane **75 ms**, p95 151 ms ;
  - 145/145 interactions journalisées, aucune divergence entre l'agent et le serveur ;
  - 55/55 valeurs masquées mises sous séquestre ;
  - chaîne d'audit intacte.
- **Charge** : de 1 à 50 agents simultanés, **0 erreur**.
  - Le débit plafonne vers 130 req/s, avec une médiane de 384 ms à 50 agents.
  - Mesure prise sur un portable i7-8650U où API, base et agents partagent le processeur, déjà occupé à 65 % par d'autres programmes. Une mesure antérieure sur la même machine, sans NER et avec un poste moins chargé, atteignait 350 req/s. Les deux chiffres ne sont pas comparables.
  - Les 11 258 événements sont tous journalisés, sans rupture de la chaîne d'audit.

### Agents réels simultanés et réseau simulé

Rapport : [agents-reels.md](resultats/agents-reels.md) (`pnpm eval:agents-reels`, moteur des agents : règles et mots-clés). La mesure de charge ci-dessus simule les agents par des requêtes HTTP. Ici, chaque agent est un **vrai processus agent**, avec son propre enrôlement, sa détection locale, sa file et sa synchronisation.

| RTT agent ↔ API simulé | 0 ms | 50 ms | 150 ms | 300 ms |
| :--- | ---: | ---: | ---: | ---: |
| Temps vu par l'utilisateur, médiane | 7,2 ms | 79,8 ms | 187,8 ms | 332,6 ms |
| p95 | 22,6 ms | 110,7 ms | 206,1 ms | 359,9 ms |

- Le temps suit le réseau : environ **un aller-retour, plus 30 à 40 ms** au-delà de 0 ms. Les décisions sont identiques à toutes les latences : 10 ALLOW, 26 BLOCK, 22 MASK sur 58.
- De 1 à **20 agents réels** pendant 30 s chacun : **0 erreur**, 17 927 interactions toutes journalisées, actions identiques entre agent et serveur, toutes les valeurs masquées mises sous séquestre, **aucune rupture** de la chaîne d'audit.
- Médiane 6,6 ms avec 1 agent, 155,6 ms avec 20. Les 20 processus agents partagent le processeur avec l'API et la base. Sur des postes séparés, leur détection locale ne se ferait pas concurrence : ces temps sont pessimistes.

## 4. Extraction des fichiers joints — mesuré

Rapport : [extraction-fichiers.md](resultats/extraction-fichiers.md) (`pnpm eval:extraction`). Les fichiers sont produits par des bibliothèques tierces (docx, SheetJS, pptxgenjs, pdf-lib) ; les images sont rendues avec une police nette.

| Format | Valeurs conservées | Secrets détectés |
| :--- | ---: | ---: |
| DOCX, XLSX, PPTX | 100 % (97/97) | 100 % (8/8) |
| PDF texte | 99,0 % (96/97) | 100 % (8/8) |
| PDF scanné (OCR) | 94,7 % (18/19) | 100 % (1/1) |
| Images (OCR) | 95,9 % (93/97) | 100 % (8/8) |

**Fichiers enregistrés par Microsoft Office** (Word, Excel, PowerPoint 2016, enregistrement à la main) : DOCX, XLSX et PPTX à **100 %** (97/97), PDF exporté par Word à **99,0 %** (96/97), **100 % des secrets** dans les quatre formats. La première mesure donnait 91,8 % et 6 secrets sur 8 pour le PDF de Word ; deux défauts, invisibles avec les fichiers des bibliothèques, ont été corrigés (voir [protocole-detection.md](protocole-detection.md) § 5 quinquies).

L'évaluation a révélé un défaut grave, corrigé depuis : l'extraction PDF échouait **en silence**, avec 0 % des valeurs lues et aucun signal d'alerte. Elle passe maintenant par pdfjs et l'OCR, signale toute lecture incomplète, et le PDF masqué est relu avant d'être renvoyé.

## 5. Surveillance des agents — mesuré

Rapports : [heartbeat-latence.md](resultats/heartbeat-latence.md), [heartbeat-fausses-alertes.md](resultats/heartbeat-fausses-alertes.md).

- **Délai d'alerte** (20 agents) : médiane 5 min 10 s après le dernier signal, au plus 5 min 29 s, conforme à la borne théorique (300 à 330 s).
- **Fausses alertes** (35 agents, 10 minutes) : aucune avec un signal régulier, retardé, ou jusqu'à 4 signaux perdus d'affilée. Au-delà, l'alerte part comme prévu.
- **Vrais agents** ([heartbeat-reel.md](resultats/heartbeat-reel.md), `pnpm eval:heartbeat:reel`, 15 min) : l'extension compilée dans Chromium, réveillée par son alarme, et le démon du CLI, lancé par `acg enroll`. Écart maximal entre deux signaux : **60,0 s** pour les deux, loin du seuil de 300 s ; **aucune alerte**. L'extension envoie parfois deux signaux à 0,3 s d'intervalle, quand l'alarme réveille un service worker arrêté : une requête de trop, sans effet sur la surveillance.

## 6. Tests fonctionnels — mesuré

| Suite | Résultat |
| :--- | ---: |
| Tests unitaires et d'intégration (`pnpm test`), dont 15 sur le mode dégradé | 272/272 |
| LLM local avec le vrai modèle (`pnpm test:llm`) | 4/4 |
| Extension dans Chromium, contre l'API réelle (`pnpm test:e2e:extension`) | 11/11 |
| Tableau de bord dans Chromium, MFA réelle (`pnpm test:e2e:dashboard`) | 16/16 |

L'extension est vérifiée sur : blocage d'un secret par trois voies d'envoi, masquage sans que la page voie la valeur, pièces jointes, journalisation. Le tableau de bord est vérifié sur : double authentification, séparation des rôles RSSI / DPO / collaborateur, pages et journal.

**Mode dégradé (fail-closed)** : 15 tests ([fail-closed.test.ts](../../packages/agent-runtime/src/fail-closed.test.ts)) font tomber la détection par NER et vérifient, sur du texte :
- la politique « Fail-closed directions à risque » bloque toute demande des directions Cotisations, Finance et Juridique, quel que soit leur niveau de risque ;
- si cette politique est supprimée, le filet de sécurité du code bloque encore les directions à haut risque, avec escalade ;
- les autres directions restent servies par les règles, qui bloquent toujours une clé API ;
- l'absence du LLM, couche facultative, ne déclenche pas le mode dégradé.

## 7. Validations non réalisées — perspectives

Deux validations demandent des participants que ce projet, conduit seul, ne pouvait pas réunir. Elles ne sont pas présentées comme faites. Leur protocole, leurs objectifs (fixés à l'avance) et leur script de calcul sont prêts et testés : elles peuvent être menées telles quelles lors d'un déploiement pilote.

| Validation | Objectif fixé à l'avance | Protocole et kit | Calcul |
| :--- | :--- | :--- | :--- |
| Utilisabilité (5 à 8 participants RSSI, DPO, métier) | SUS ≥ 68 ; ≥ 80 % de tâches réussies sans aide ; 100 % sur les tâches critiques (accès justifié, validation de politique) | [utilisabilite/protocole.md](utilisabilite/protocole.md), [kit-seance.md](utilisabilite/kit-seance.md) | `pnpm eval:utilisabilite` |
| Prompts réels anonymisés (150 à 200, accord du DPO) | Rappel protection ≥ 75 % ; F1 partiel ≥ 75 % ; 100 % des secrets (corpus manuel de référence : 80,4 % et 78,4 %) | [prompts-reels/protocole.md](prompts-reels/protocole.md), [kit-collecte.md](prompts-reels/kit-collecte.md) | `pnpm eval:prompts-reels` |

**Formulation proposée pour la conclusion** :

> Sur un corpus synthétique de 385 prompts, la passerelle détecte 93,5 % des données sensibles et réduit la ré-identification de 99,5 % à 2,0 %, pour un délai de 75 ms en médiane. Elle tient la charge de 20 agents réels sans erreur, lit les fichiers bureautiques produits par Microsoft Office et fonctionne sur les 8 services d'IA testés. Le système répond donc aux exigences de protection et de performance posées au départ. Deux questions restent ouvertes et constituent les prochaines étapes d'un déploiement pilote : la tenue de ces résultats sur des demandes réelles d'agents, et la facilité d'usage du tableau de bord par ses futurs utilisateurs. Les protocoles correspondants sont prêts.

## 8. Limites

- **Corpus synthétique** ; accord entre deux annotateurs bon sur la protection (90,1 %) mais F1 strict de 71,4 % (mesuré avant arbitrage ; les 34 désaccords ont ensuite été arbitrés, 3 corrections de la référence) ; l'évaluation sur des prompts réels anonymisés n'a pas été menée (accord du DPO et volontaires nécessaires) ; protocole, kit et script sont prêts.
- **Utilisabilité non évaluée** : les tests vérifient que le tableau de bord fonctionne, pas qu'il est facile à utiliser ; les séances (5 à 8 participants) n'ont pas pu être organisées dans un projet conduit seul.
- **Une seule machine** pour la latence et la charge ; le débit dépend de la charge du poste. Le réseau est simulé par un délai fixe, sans perte ni gigue.
- **Vrais sites** : grille manuelle du 12/11/2026, qui ne vaut qu'à sa date (les sites changent sans préavis). Seul chatgpt.com a été recoupé avec le journal en base ; les 7 autres sites ont été testés sur d'autres postes, relevé de l'opérateur.
- **Heartbeat réel** mesuré poste éveillé et navigateur ouvert ; la veille et la fermeture du navigateur ne sont pas couvertes (l'alerte y est voulue).
- **Fonctions et postes non détectés** : c'est la principale source de données encore lisibles après masquage.
- **Secrets dans les fichiers** : seuls 8 secrets sont annotés, c'est un contrôle plutôt qu'une estimation précise. L'OCR est mesuré sur des images nettes, pas sur des scans réels.
- **LLM de contexte** : utile sur les formulations libres, mais moins fiable au global et trop lent sur CPU ; il reste désactivé par défaut. Testé avec et sans modèle (`pnpm test`, `pnpm test:llm`).
- Détail complet des limites : § 8 de [protocole-detection.md](protocole-detection.md).

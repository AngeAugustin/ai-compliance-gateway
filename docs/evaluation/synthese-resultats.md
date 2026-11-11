# Synthèse des résultats — AI Compliance Gateway

Document de référence pour le mémoire et la soutenance. Chaque chiffre porte un statut :

- **Mesuré** : obtenu par un script reproductible, rapport détaillé en lien ;
- **Objectif** : critère fixé avant la mesure, qui reste à vérifier ; ce n'est pas un résultat.

Protocole complet : [protocole-detection.md](protocole-detection.md).

## 1. En une page

| Question | Réponse | Statut |
| :--- | :--- | :--- |
| Le moteur trouve-t-il les données sensibles ? | F1 **90,8 %** (IC 95 % : 89,3–92,2 %), rappel protection **93,6 %**, sur 385 prompts et 975 entités | Mesuré |
| Que reste-t-il de lisible après masquage ? | **6,4 %** des entités, dont 44 sur 62 sont des fonctions / postes, hors périmètre de détection | Mesuré |
| Peut-on encore identifier la personne ? | Ré-identification **99,5 % → 2,0 %** ; taille médiane du groupe de candidats 1 → 77 | Mesuré |
| Le blocage ralentit-il l'utilisateur ? | **75 ms** en médiane, 151 ms au p95, décision et journalisation comprises | Mesuré |
| Le serveur tient-il la charge ? | **0 erreur** jusqu'à 50 agents simultanés, environ 130 req/s sur un portable chargé ; chaîne d'audit intacte sur 11 258 événements ; 20 vrais agents : 0 erreur sur 17 927 interactions | Mesuré |
| Et sur un réseau lent ? | Le délai suit le réseau : 333 ms en médiane avec 300 ms d'aller-retour, mêmes décisions | Mesuré |
| Que se passe-t-il si la détection tombe ? | Directions à risque bloquées (politique, puis filet du code) ; 15 tests | Mesuré |
| Les fichiers joints sont-ils lus ? | **100 %** des valeurs en DOCX, XLSX et PPTX ; 99 % en PDF ; **100 % des secrets** détectés dans tous les formats, images comprises | Mesuré |
| Les agents désactivés sont-ils repérés ? | Alerte **5 min 10 s** en médiane après le dernier signal ; aucune fausse alerte jusqu'à 4 signaux perdus ; vrais agents : signal toutes les 60 s, 0 alerte en 15 min | Mesuré |
| L'extension marche-t-elle sur les vrais sites ? | 100 % sur ChatGPT, Gemini, Claude, Copilot | Objectif |
| Les résultats tiennent-ils sur des prompts réels ? | Rappel protection ≥ 75 %, F1 ≥ 75 % | Objectif |
| Le tableau de bord est-il facile à utiliser ? | SUS ≥ 68, ≥ 80 % de tâches réussies sans aide | Objectif |
| L'annotation est-elle fiable ? | Kappa ≥ 0,80, F1 protection ≥ 90 % entre deux annotateurs | Objectif |

## 2. Détection des données sensibles — mesuré

Rapport : [resultats-detection.md](resultats/resultats-detection.md) (`pnpm eval:detection`, graine 2026). Corpus : 65 prompts écrits à la main, 300 générés, 20 documents longs ; 975 entités annotées ; 103 prompts sans donnée sensible.

| Configuration | Précision | Rappel | F1 (IC 95 %) | Rappel protection | Latence p50 / p95 |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Règles seules | 96,5 % | 50,9 % | 66,6 % (63,8–69,0 %) | 52,3 % | 0,24 / 1,43 ms |
| NER seul | 78,7 % | 40,6 % | 53,6 % (50,9–56,3 %) | 42,8 % | 82,6 / 337 ms |
| **Moteur complet** | **90,2 %** | **91,4 %** | **90,8 % (89,3–92,2 %)** | **93,6 %** | 114 / 350 ms |

- Les couches se complètent : les règles couvrent les identifiants structurés (IBAN, numéros CNSS, clés : 100 %), le NER les noms, organisations et adresses (noms : 97 %).
- Corpus manuel, le plus proche de l'usage réel : F1 **78,2 %**, plus bas que sur le corpus généré (92,8 %), dont les gabarits sont réguliers. Le manuel est la référence pour la généralisation.
- Données encore lisibles après la passerelle : **6,4 %** des entités. La principale cause est connue : les fonctions et postes ne sont pas détectés (44 entités sur 62).

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

L'évaluation a révélé un défaut grave, corrigé depuis : l'extraction PDF échouait **en silence**, avec 0 % des valeurs lues et aucun signal d'alerte. Elle passe maintenant par pdfjs et l'OCR, signale toute lecture incomplète, et le PDF masqué est relu avant d'être renvoyé.

## 5. Surveillance des agents — mesuré

Rapports : [heartbeat-latence.md](resultats/heartbeat-latence.md), [heartbeat-fausses-alertes.md](resultats/heartbeat-fausses-alertes.md).

- **Délai d'alerte** (20 agents) : médiane 5 min 10 s après le dernier signal, au plus 5 min 29 s, conforme à la borne théorique (300 à 330 s).
- **Fausses alertes** (35 agents, 10 minutes) : aucune avec un signal régulier, retardé, ou jusqu'à 4 signaux perdus d'affilée. Au-delà, l'alerte part comme prévu.
- **Vrais agents** ([heartbeat-reel.md](resultats/heartbeat-reel.md), `pnpm eval:heartbeat:reel`, 15 min) : l'extension compilée dans Chromium, réveillée par son alarme, et le démon du CLI, lancé par `acg enroll`. Écart maximal entre deux signaux : **60,0 s** pour les deux, loin du seuil de 300 s ; **aucune alerte**. L'extension envoie parfois deux signaux à 0,3 s d'intervalle, quand l'alarme réveille un service worker arrêté : une requête de trop, sans effet sur la surveillance.

## 6. Tests fonctionnels — mesuré

| Suite | Résultat |
| :--- | ---: |
| Tests unitaires et d'intégration (`pnpm test`), dont 15 sur le mode dégradé | 263/263 |
| LLM local avec le vrai modèle (`pnpm test:llm`) | 4/4 |
| Extension dans Chromium, contre l'API réelle (`pnpm test:e2e:extension`) | 10/10 |
| Tableau de bord dans Chromium, MFA réelle (`pnpm test:e2e:dashboard`) | 16/16 |

L'extension est vérifiée sur : blocage d'un secret par trois voies d'envoi, masquage sans que la page voie la valeur, pièces jointes, journalisation. Le tableau de bord est vérifié sur : double authentification, séparation des rôles RSSI / DPO / collaborateur, pages et journal.

**Mode dégradé (fail-closed)** : 15 tests ([fail-closed.test.ts](../../packages/agent-runtime/src/fail-closed.test.ts)) font tomber la détection par NER et vérifient, sur du texte :
- la politique « Fail-closed directions à risque » bloque toute demande des directions Cotisations, Finance et Juridique, quel que soit leur niveau de risque ;
- si cette politique est supprimée, le filet de sécurité du code bloque encore les directions à haut risque, avec escalade ;
- les autres directions restent servies par les règles, qui bloquent toujours une clé API ;
- l'absence du LLM, couche facultative, ne déclenche pas le mode dégradé.

## 7. Validations restantes — objectifs

Les protocoles et les scripts de calcul sont prêts et testés. Les objectifs ont été fixés **avant** toute mesure.

| Validation | Objectif | Protocole | Calcul |
| :--- | :--- | :--- | :--- |
| Utilisabilité (5 à 8 participants RSSI, DPO, métier) | SUS ≥ 68 ; ≥ 80 % de tâches réussies sans aide ; 100 % sur les tâches critiques (accès justifié, validation de politique) | [utilisabilite/protocole.md](utilisabilite/protocole.md) | `pnpm eval:utilisabilite` |
| Accord entre deux annotateurs (65 prompts) | Kappa ≥ 0,80 ; F1 protection ≥ 90 % ; F1 strict ≥ 80 % | [annotation/guide-annotation.md](annotation/guide-annotation.md) | `pnpm eval:accord` |
| Fichiers produits par Microsoft Office | Mêmes taux que les bibliothèques : 100 % DOCX / XLSX / PPTX, ≥ 99 % PDF, 100 % des secrets | [LISEZMOI.md](../../data/eval/fichiers-office/office/LISEZMOI.md) | `pnpm eval:extraction` |
| Extension sur les vrais services d'IA (8 sites, données fictives) | 100 % de conformité sur ChatGPT, Gemini, Claude et Copilot | [sites-reels/protocole.md](sites-reels/protocole.md) | Grille à la main |
| Prompts réels anonymisés (150 à 200, accord du DPO) | Rappel protection ≥ 75 % ; F1 partiel ≥ 75 % ; 100 % des secrets (corpus manuel de référence : 80,4 % et 78,4 %) | [prompts-reels/protocole.md](prompts-reels/protocole.md) | `pnpm eval:prompts-reels` |

**Formulation proposée pour la conclusion** :

> Sur les mesures réalisées, la passerelle détecte 93,6 % des données sensibles et réduit la ré-identification de 99,5 % à 2,0 %, pour un délai de 75 ms en médiane. Sous réserve que les validations restantes (utilisabilité, accord inter-annotateurs, fichiers Office, vrais services d'IA, prompts réels) atteignent les objectifs fixés, le système répond aux exigences de protection, de performance et d'exploitabilité posées au départ.

## 8. Limites

- **Corpus synthétique**, annoté par une seule personne pour l'instant ; l'évaluation sur des prompts réels anonymisés est préparée (protocole, script) mais demande l'accord du DPO.
- **Une seule machine** pour la latence et la charge ; le débit dépend de la charge du poste. Le réseau est simulé par un délai fixe, sans perte ni gigue.
- **Extension testée sur une page simulée** : les vrais sites changent sans préavis ; la grille de vérification manuelle ne vaut qu'à sa date.
- **Heartbeat réel** mesuré poste éveillé et navigateur ouvert ; la veille et la fermeture du navigateur ne sont pas couvertes (l'alerte y est voulue).
- **Fonctions et postes non détectés** : c'est la principale source de données encore lisibles après masquage.
- **Secrets dans les fichiers** : seuls 8 secrets sont annotés, c'est un contrôle plutôt qu'une estimation précise. L'OCR est mesuré sur des images nettes, pas sur des scans réels.
- **LLM de contexte** : utile sur les formulations libres, mais moins fiable au global et trop lent sur CPU ; il reste désactivé par défaut. Testé avec et sans modèle (`pnpm test`, `pnpm test:llm`).
- Détail complet des limites : § 8 de [protocole-detection.md](protocole-detection.md).

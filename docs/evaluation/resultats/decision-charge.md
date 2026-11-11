# Décision de bout en bout et charge — moteur complet (règles + NER + mots-clés)

Date : 2026-11-11 · API et PostgreSQL sur la même machine que l'agent · base jetable dédiée.

## 1. Bout en bout (un agent réel)

Agent A1 enrôlé par le parcours réel (jeton → enrôlement → synchro des politiques du seed) en 1957,7 ms, puis 145 interactions : les 29 scénarios texte E2E, 5 fois chacun. Actions : ALLOW 25, BLOCK 65, MASK 55.

| Étape | n | médiane | p95 | p99 | max |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Décision locale (détection → score → politique → masquage) | 145 | 53 ms | 101 ms | 273 ms | 376 ms |
| Journalisation (POST /evaluate signé, recalcul serveur, écriture) | 145 | 20,9 ms | 35,9 ms | 111,2 ms | 2809,9 ms |
| Total attendu par l'utilisateur (intercept) | 145 | 75,4 ms | 151,2 ms | 403,2 ms | 2893,9 ms |

Contrôles : 145/145 interactions journalisées, avec la même action et dans le même ordre ; 0 divergence(s) agent/serveur ; 55/55 séquestres pour les MASK ; file hors ligne restante : 0 ; chaîne d'audit : 0 rupture(s) sur 145 événements.

## 2. Charge (POST /v1/interactions/evaluate)

Agents inscrits en base, requêtes signées rejouées en boucle fermée (chaque agent renvoie dès la réponse reçue), 20 s par palier.

| Agents simultanés | Requêtes | Débit | médiane | p95 | p99 | max | Erreurs |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| 1 | 845 | 42,2 req/s | 20,6 ms | 39,6 ms | 43,1 ms | 72,6 ms | 0 |
| 5 | 2595 | 129,6 req/s | 37,7 ms | 46,5 ms | 53,4 ms | 457,1 ms | 0 |
| 10 | 2630 | 131,2 req/s | 73,8 ms | 94,2 ms | 123,8 ms | 494,2 ms | 0 |
| 25 | 2590 | 128,7 req/s | 191,7 ms | 233,1 ms | 255,5 ms | 349,4 ms | 0 |
| 50 | 2598 | 128,2 req/s | 383,6 ms | 474,7 ms | 530,3 ms | 577,8 ms | 0 |

Après la charge : 11258 événements journalisés pour 11258 réponses réussies ; chaîne d'audit : **0 rupture(s)** et 0 bifurcation(s) (deux événements déclarant le même prédécesseur) sur 11258 événements.

## Limites

- Une seule machine : agent, API et base se partagent le processeur ; le réseau (latence, pertes) n'est pas simulé.

- En charge, les agents rejouent des requêtes déjà décidées : la détection locale, qui tourne sur chaque poste, n'est pas comptée dans la charge serveur.

- Paliers courts (20 s) : pas de mesure d'endurance.

# Décision de bout en bout et charge — règles + mots-clés (sans NER)

Date : 2026-11-10 · API et PostgreSQL sur la même machine que l'agent · base jetable dédiée.

## 1. Bout en bout (un agent réel)

Agent A1 enrôlé par le parcours réel (jeton → enrôlement → synchro des politiques du seed) en 91,2 ms, puis 145 interactions : les 29 scénarios texte E2E, 5 fois chacun. Actions : ALLOW 25, BLOCK 65, MASK 55.

| Étape | n | médiane | p95 | p99 | max |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Décision locale (détection → score → politique → masquage) | 145 | 1 ms | 2 ms | 85 ms | 110 ms |
| Journalisation (POST /evaluate signé, recalcul serveur, écriture) | 145 | 9,1 ms | 13,4 ms | 18,2 ms | 30,2 ms |
| Total attendu par l'utilisateur (intercept) | 145 | 11 ms | 18,3 ms | 97,6 ms | 121,5 ms |

Contrôles : 145/145 interactions journalisées, avec la même action et dans le même ordre ; 0 divergence(s) agent/serveur ; 55/55 séquestres pour les MASK ; file hors ligne restante : 0 ; chaîne d'audit : 0 rupture(s) sur 145 événements.

## 2. Charge (POST /v1/interactions/evaluate)

Agents inscrits en base, requêtes signées rejouées en boucle fermée (chaque agent renvoie dès la réponse reçue), 20 s par palier.

| Agents simultanés | Requêtes | Débit | médiane | p95 | p99 | max | Erreurs |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| 1 | 3181 | 159 req/s | 6 ms | 8,8 ms | 11,7 ms | 28,8 ms | 0 |
| 5 | 6425 | 321,1 req/s | 14,6 ms | 22,2 ms | 27,9 ms | 161,4 ms | 0 |
| 10 | 7022 | 350,8 req/s | 27,9 ms | 33,9 ms | 41,5 ms | 200,9 ms | 0 |
| 25 | 6827 | 340,6 req/s | 71,9 ms | 91,8 ms | 118,7 ms | 166 ms | 0 |
| 50 | 6588 | 327,9 req/s | 149,4 ms | 198,1 ms | 248,1 ms | 306,8 ms | 0 |

Après la charge : 30043 événements journalisés pour 30043 réponses réussies ; chaîne d'audit : **0 rupture(s)** et 0 bifurcation(s) (deux événements déclarant le même prédécesseur) sur 30043 événements.

## Limites

- Une seule machine : agent, API et base se partagent le processeur ; le réseau (latence, pertes) n'est pas simulé.

- En charge, les agents rejouent des requêtes déjà décidées : la détection locale, qui tourne sur chaque poste, n'est pas comptée dans la charge serveur.

- Paliers courts (20 s) : pas de mesure d'endurance.

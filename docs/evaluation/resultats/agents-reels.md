# Agents réels et réseau simulé

Date : 2026-11-11 · moteur des agents : règles + mots-clés · API et PostgreSQL sur la même machine · base jetable dédiée. Script : [agents-reels.ts](../../../tools/eval/agents-reels.ts).

## A. Effet de la latence réseau (un agent réel)

Un relais local retarde chaque échange agent ↔ API d'un aller-retour (RTT) donné. 29 scénarios texte × 2.

| RTT simulé | Interactions | Total médian | p95 | max | Actions |
| ---: | ---: | ---: | ---: | ---: | :--- |
| 0 ms | 58 | 7.2 ms | 22.6 ms | 106.8 ms | ALLOW 10, BLOCK 26, MASK 22 |
| 50 ms | 58 | 79.8 ms | 110.7 ms | 112.3 ms | ALLOW 10, BLOCK 26, MASK 22 |
| 150 ms | 58 | 187.8 ms | 206.1 ms | 208.2 ms | ALLOW 10, BLOCK 26, MASK 22 |
| 300 ms | 58 | 332.6 ms | 359.9 ms | 360.8 ms | ALLOW 10, BLOCK 26, MASK 22 |

## B. Agents réels simultanés

Chaque agent est un processus distinct (un poste) : son propre moteur, son propre enrôlement, sa propre synchronisation. Tous interceptent les scénarios en boucle pendant 30 s, départ synchronisé.

| Agents | Prêts | Interactions | Par seconde | Total médian | p95 | Erreurs | Journalisés | Actions identiques | Divergences | Séquestres | File restante | Ruptures de chaîne |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- | ---: | ---: | ---: | ---: |
| 1 | 1 | 4299 | 143.3 | 6.6 ms | 9.5 ms | 0 | 4299 | oui | 0 | 1629/1629 | 0 | 0 |
| 5 | 5 | 6638 | 221.3 | 21 ms | 31.2 ms | 0 | 6638 | oui | 0 | 2519/2519 | 0 | 0 |
| 10 | 10 | 3698 | 123.3 | 70.6 ms | 103.1 ms | 0 | 3698 | oui | 0 | 1403/1403 | 0 | 0 |
| 20 | 20 | 3292 | 109.7 | 155.6 ms | 216.8 ms | 0 | 3292 | oui | 0 | 1265/1265 | 0 | 0 |

## Lecture

- Le total est le temps d'intercept() : décision locale plus journalisation signée, que l'utilisateur attend avant l'envoi.
- Les agents partagent le processeur de la machine avec l'API et la base : sur des postes séparés, leur détection locale ne se ferait pas concurrence. Les temps en B sont donc pessimistes.
- Le relais simule un délai fixe, sans perte ni gigue.

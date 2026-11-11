# Fausses alertes « agent manquant » — mesure de bout en bout

Date : 2026-11-10 · 35 agents simulés pendant 600 s · signal attendu toutes les 60 s · seuil 300 s · contrôle serveur toutes les 30 s (réglages réels de l'API).

Fausses alertes : **5 agent(s) sur 30** restés actifs. Signaux refusés par l'API : 0.

| Profil | Agents | Signaux reçus | Plus long écart entre deux signaux | Alerte attendue | Agents alertés « manquant » | Rétablissements signalés |
| :--- | ---: | ---: | :--- | :--- | ---: | ---: |
| Signal régulier | 5 | 50 | 60–60 s | non | 0 | 0 |
| Signal retardé de 0 à 20 s | 5 | 43 | 71–79 s | non | 0 | 0 |
| Coupure : 2 signaux perdus | 5 | 40 | 180–180 s | non | 0 | 0 |
| Coupure : 3 signaux perdus | 5 | 35 | 240–240 s | non | 0 | 0 |
| Coupure : 4 signaux perdus | 5 | 30 | 300–300 s | non | 0 | 0 |
| Coupure : 4 signaux perdus, avec retard | 5 | 25 | 332–353 s | non | 5 | 5 |
| Mise en veille : 6 signaux perdus (témoin) | 5 | 20 | 420–420 s | oui | 5 | 5 |

## Lecture

- Une alerte part quand un contrôle trouve un dernier signal plus vieux que 300 s. Avec un signal toutes les 60 s, l'agent peut perdre jusqu'à 4 signaux d'affilée sans alerte ; au 5e, l'écart atteint le seuil, et tout retard d'envoi le fait dépasser.

- Les écarts sont mesurés côté agent simulé entre deux signaux acceptés.

## Limites

- Retards et coupures simulés (gigue uniforme, pertes d'affilée) : la distribution réelle des retards d'alarme Chrome et des coupures réseau n'est pas connue.

- API et base sur la même machine ; une indisponibilité de l'API elle-même (redémarrage) n'est pas testée ici : au retour, tous les agents dont le dernier signal dépasse le seuil seraient alertés au premier contrôle.

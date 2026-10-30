# Délai d'alerte « agent manquant » — mesure de bout en bout

Date : 2026-10-30 · 20 agents simulés · signal toutes les 60 s · seuil 300 s · contrôle serveur toutes les 30 s. Désactivation tirée uniformément entre 70 et 190 s après l'inscription ; phase d'envoi propre à chaque agent, tirée dans [0, 60[ s. Dates prises sur l'horloge de la base.

Signaux refusés par l'API : 0. Agents sans alerte à l'échéance : 0.

| Délai | n | min | médiane | p95 | max | moyenne | borne théorique |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| Désactivation → alerte | 20 | 258,3 s | 279,5 s | 313,7 s | 323,9 s | 283,8 s | 240–330 s |
| Dernier signal → alerte | 20 | 302,3 s | 309,7 s | 327,9 s | 329,2 s | 313,8 s | 300–330 s |

## Détail par agent

| Agent | Désactivé à | Signaux envoyés | Dernier signal → désactivation | Désactivation → alerte | Dernier signal → alerte |
| :--- | ---: | ---: | ---: | ---: | ---: |
| f4a2ad68 | 78,0 s | 1 | 40,4 s | 275,1 s | 315,5 s |
| fad845f5 | 79,6 s | 2 | 17,6 s | 303,0 s | 320,6 s |
| d4f7a338 | 88,3 s | 2 | 15,0 s | 294,8 s | 309,7 s |
| 11f4fd70 | 91,5 s | 2 | 11,9 s | 291,1 s | 303,0 s |
| d8ffb313 | 94,5 s | 2 | 17,6 s | 288,6 s | 306,1 s |
| e5f30af1 | 103,4 s | 2 | 27,2 s | 279,5 s | 306,7 s |
| 9935099e | 105,2 s | 2 | 42,6 s | 277,5 s | 320,1 s |
| e40b65c9 | 106,1 s | 1 | 50,9 s | 276,9 s | 327,9 s |
| 85c12f58 | 110,2 s | 2 | 3,6 s | 302,8 s | 306,4 s |
| bc039132 | 116,7 s | 2 | 49,9 s | 266,0 s | 315,9 s |
| a411780b | 118,8 s | 2 | 3,6 s | 323,9 s | 327,6 s |
| 0bc19749 | 119,7 s | 2 | 42,2 s | 263,4 s | 305,6 s |
| 2a9d4cf8 | 124,6 s | 2 | 46,3 s | 258,3 s | 304,6 s |
| 99bb4b8a | 137,8 s | 3 | 18,0 s | 304,9 s | 322,9 s |
| 70c2c6d3 | 149,3 s | 2 | 52,2 s | 263,5 s | 315,7 s |
| 246ec462 | 149,7 s | 2 | 38,8 s | 263,5 s | 302,3 s |
| 67b712ef | 151,9 s | 2 | 43,9 s | 260,9 s | 304,8 s |
| 9c14eb37 | 159,0 s | 3 | 15,5 s | 313,7 s | 329,2 s |
| 598753e0 | 163,4 s | 2 | 45,9 s | 279,6 s | 325,5 s |
| 52a774fd | 183,1 s | 3 | 17,0 s | 289,7 s | 306,7 s |

## Limites

- Agents simulés au signal parfaitement régulier : les retards d'alarme de Chrome (service worker suspendu, mise en veille) et du démon A2 ne sont pas reproduits ; ils ne peuvent qu'allonger le délai.

- API et base sur la même machine, sans charge ; le délai d'affichage dans le dashboard (rafraîchissement) n'est pas compté.

# Heartbeat des vrais agents

Date : 2026-11-11 · durée 15 min · signal attendu toutes les 60 s · seuil d'alerte 300 s · API et base sur la même machine. Script : [heartbeat-reel.ts](../../../tools/eval/heartbeat-reel.ts).

| Agent | Signaux reçus | Écart min | Écart médian | p95 | Écart max | Écarts > 300 s | Alertes « manquant » |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A1 — extension (Chromium, alarme chrome.alarms) | 21 | 0,3 s | 59,7 s | 60,0 s | 60,0 s | 0 | 0 |
| A2 — démon du CLI (processus Node détaché) | 16 | 3,4 s | 60,0 s | 60,0 s | 60,0 s | 0 | 0 |

## Lecture

- Heure de réception prise en base (last_heartbeat_at), relevée chaque seconde : précision d'environ 1 s.
- Les écarts sont ceux que voit le serveur : retard de l'alarme ou du minuteur, plus le temps d'envoi.
- Non couvert : poste en veille, navigateur fermé, Chrome longtemps en arrière-plan. Dans ces cas l'alerte est attendue (l'agent ne protège plus), ce que vérifie le profil témoin de heartbeat-fausses-alertes.md.

# Le LLM de contexte dans le moteur

Date : 2026-11-11 · Phi-3.5-mini Q4_K_M, CPU · 365 prompts étiquetés (graine 2026) · chargement du modèle 12.7 s · repli sur les lexiques pendant la mesure : 0.

## Exactitude de la catégorie de contexte

| Méthode | Corpus manuel | Corpus généré | Global |
| :--- | ---: | ---: | ---: |
| Lexiques seuls (défaut) | 61,5 % (40/65) | 97,7 % (293/300) | 91,2 % (333/365) |
| LLM seul | 73,8 % (48/65) | 54,0 % (162/300) | 57,5 % (210/365) |
| **Moteur avec LLM (contexte final)** | 76,9 % (50/65) | 70,0 % (210/300) | 71,2 % (260/365) |

## Arbitrage entre LLM et lexiques

- Désaccords LLM / lexiques : 168 sur 365.
- Le LLM l'emporte dans le moteur : 118 fois ; les lexiques : 50 fois.
- LLM juste mais écarté par les lexiques : 0 ; LLM faux mais retenu : 98.

## Temps de détection du moteur avec LLM

Médiane 2973 ms · p95 4220 ms · max 9384 ms (règles, mots-clés et LLM, sans NER ; le LLM traite un prompt à la fois).

## Lecture

- « LLM seul » est le chiffre de l'évaluation de la détection. Le « contexte final » est celui qui entre réellement dans le score de risque quand LLM_MODEL_PATH est renseigné.
- Le contexte pèse 15 % du score de risque ; il ne change ni les entités détectées ni leur masquage.

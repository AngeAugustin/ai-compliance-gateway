# Résultats de l'évaluation de la détection

> Rapport généré par `pnpm eval:detection` le 2026-11-11 — graine 2026, 1 répétitions de latence, Node 24.12.0 (win32-x64, Intel(R) Core(TM) i7-8650U CPU @ 1.90GHz), durée 1289 s. Protocole : [protocole-detection.md](../protocole-detection.md). Ne pas modifier à la main.

NER : indisponible (désactivé (--sans-ner)). LLM de contexte : chargé.

## 1. Synthèse

| Configuration | Précision | Rappel | F1 (IC 95 %) | F1 strict | Rappel protection | Latence p50 / p95 |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Règles seules** | 96,5 % | 50,9 % | 66,6 % (63,8 % – 69,0 %) | 65,0 % | 52,3 % | 0,21 / 1,10 ms |
| **Moteur sans NER** | 96,5 % | 50,9 % | 66,6 % (63,8 % – 69,0 %) | 65,0 % | 52,3 % | 0,28 / 1,24 ms |

Appariement **partiel** (même type, chevauchement) sauf mention contraire, micro-moyenne sur tout le corpus. **Rappel protection** : part des données sensibles recouvertes par une détection, quel que soit le type — c'est ce qui conditionne le masquage.

## 2. Corpus

| Sous-corpus | Prompts |
| :--- | ---: |
| Manuel | 65 |
| Généré | 300 |
| Documents multi-demandes | 20 |

385 prompts, 975 entités annotées, 103 prompts sans aucune donnée sensible (négatifs). 200 scénarios supplémentaires pour l'expérience de ré-identification.

| Type | Entités annotées |
| :--- | ---: |
| Nom de personne | 267 |
| Organisation | 90 |
| Adresse postale | 55 |
| Montant financier | 54 |
| Donnée médicale | 53 |
| Fonction / poste | 44 |
| Date de naissance | 43 |
| Clé d'API | 39 |
| IBAN | 38 |
| Numéro d'assuré CNSS | 38 |
| Salaire / cotisation | 36 |
| Adresse e-mail | 27 |
| Numéro de téléphone | 27 |
| Identifiant interne | 27 |
| Carte bancaire | 18 |
| Identifiant national (NPI/IFU) | 17 |
| Chaîne de connexion | 17 |
| Numéro employeur CNSS | 16 |
| Adresse IP | 15 |
| URL interne | 15 |
| Identifiant fiscal | 14 |
| Numéro mobile money | 13 |
| Mot de passe | 11 |
| Clé privée | 1 |

## 3. Résultats par configuration

### Règles seules

Couche 1 (regex + validateurs), sortie brute. Macro-F1 (par type) : 77,2 %. F1 sur son périmètre déclaré : 96,0 %.

| Sous-ensemble | VP | FP | FN | Précision | Rappel | F1 |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| Tout — Strict | 484 | 30 | 491 | 94,2 % | 49,6 % | 65,0 % |
| Tout — Partiel | 496 | 18 | 479 | 96,5 % | 50,9 % | 66,6 % |
| Tout — Protection | 510 | 4 | 465 | 99,2 % | 52,3 % | 68,5 % |
| Manuel — Partiel | 44 | 5 | 53 | 89,8 % | 45,4 % | 60,3 % |
| Généré — Partiel | 263 | 11 | 275 | 96,0 % | 48,9 % | 64,8 % |
| Documents multi-demandes — Partiel | 189 | 2 | 151 | 99,0 % | 55,6 % | 71,2 % |

### Moteur sans NER

Règles + mots-clés + réglages (seuils, contexte) — mode dégradé. Macro-F1 (par type) : 77,2 %. F1 sur son périmètre déclaré : 96,0 %.

| Sous-ensemble | VP | FP | FN | Précision | Rappel | F1 |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| Tout — Strict | 484 | 30 | 491 | 94,2 % | 49,6 % | 65,0 % |
| Tout — Partiel | 496 | 18 | 479 | 96,5 % | 50,9 % | 66,6 % |
| Tout — Protection | 510 | 4 | 465 | 99,2 % | 52,3 % | 68,5 % |
| Manuel — Partiel | 44 | 5 | 53 | 89,8 % | 45,4 % | 60,3 % |
| Généré — Partiel | 263 | 11 | 275 | 96,0 % | 48,9 % | 64,8 % |
| Documents multi-demandes — Partiel | 189 | 2 | 151 | 99,0 % | 55,6 % | 71,2 % |

## 4. Résultats par type d'entité (F1 partiel)

| Type | Support | Règles seules | Moteur sans NER |
| :--- | ---: | ---: | ---: |
| Nom de personne | 267 | hors périmètre | hors périmètre |
| Organisation | 90 | hors périmètre | hors périmètre |
| Adresse postale | 55 | hors périmètre | hors périmètre |
| Montant financier | 54 | 96 % (R 96 %) | 96 % (R 96 %) |
| Donnée médicale | 53 | 96 % (R 92 %) | 96 % (R 92 %) |
| Fonction / poste | 44 | hors périmètre | hors périmètre |
| Date de naissance | 43 | 98 % (R 95 %) | 98 % (R 95 %) |
| Clé d'API | 39 | 100 % (R 100 %) | 100 % (R 100 %) |
| Numéro d'assuré CNSS | 38 | 100 % (R 100 %) | 100 % (R 100 %) |
| IBAN | 38 | 100 % (R 100 %) | 100 % (R 100 %) |
| Salaire / cotisation | 36 | 100 % (R 100 %) | 100 % (R 100 %) |
| Adresse e-mail | 27 | 100 % (R 100 %) | 100 % (R 100 %) |
| Identifiant interne | 27 | 100 % (R 100 %) | 100 % (R 100 %) |
| Numéro de téléphone | 27 | 98 % (R 100 %) | 98 % (R 100 %) |
| Carte bancaire | 18 | 100 % (R 100 %) | 100 % (R 100 %) |
| Chaîne de connexion | 17 | 100 % (R 100 %) | 100 % (R 100 %) |
| Identifiant national (NPI/IFU) | 17 | 68 % (R 94 %) | 68 % (R 94 %) |
| Numéro employeur CNSS | 16 | 100 % (R 100 %) | 100 % (R 100 %) |
| URL interne | 15 | 100 % (R 100 %) | 100 % (R 100 %) |
| Adresse IP | 15 | 97 % (R 100 %) | 97 % (R 100 %) |
| Identifiant fiscal | 14 | 0 % (R 0 %) | 0 % (R 0 %) |
| Numéro mobile money | 13 | 100 % (R 100 %) | 100 % (R 100 %) |
| Mot de passe | 11 | 100 % (R 100 %) | 100 % (R 100 %) |
| Clé privée | 1 | 100 % (R 100 %) | 100 % (R 100 %) |

« hors périmètre » : la configuration ne produit jamais ce type ; ses occurrences comptent comme faux négatifs dans les totaux.

Faux positifs les plus fréquents :

- **Règles seules** : Identifiant national (NPI/IFU) (14), Montant financier (2), Numéro de téléphone (1), Adresse IP (1)
- **Moteur sans NER** : Identifiant national (NPI/IFU) (14), Montant financier (2), Numéro de téléphone (1), Adresse IP (1)

## 5. Classification du contexte

### Lexiques (couche 3, repli)

365 prompts étiquetés — exactitude 91,2 %, macro-F1 91,2 %. Par corpus : manuel 61,5 % (40/65) · genere 97,7 % (293/300).

| Attendu \ Prédit | RH | Finance | Juridique | Technique | Medical | Generique |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| RH | 61 | 1 | 0 | 0 | 0 | 9 |
| Finance | 0 | 79 | 0 | 0 | 0 | 2 |
| Juridique | 0 | 0 | 40 | 0 | 1 | 2 |
| Technique | 0 | 1 | 0 | 56 | 1 | 5 |
| Medical | 0 | 0 | 0 | 0 | 42 | 3 |
| Generique | 0 | 1 | 6 | 0 | 0 | 55 |

### LLM local (couche 3)

365 prompts étiquetés — exactitude 57,5 %, macro-F1 55,0 %. Par corpus : manuel 73,8 % (48/65) · genere 54,0 % (162/300).

| Attendu \ Prédit | RH | Finance | Juridique | Technique | Medical | Generique |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| RH | 52 | 2 | 15 | 1 | 0 | 1 |
| Finance | 16 | 65 | 0 | 0 | 0 | 0 |
| Juridique | 0 | 0 | 43 | 0 | 0 | 0 |
| Technique | 18 | 13 | 2 | 30 | 0 | 0 |
| Medical | 29 | 0 | 3 | 0 | 13 | 0 |
| Generique | 48 | 1 | 6 | 0 | 0 | 7 |

## 6. Latence

| Configuration | Mesures | p50 | p95 | p99 | Moyenne | Max | Débit |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Règles seules | 385 | 0,21 ms | 1,10 ms | 2,52 ms | 0,37 ms | 6,22 ms | 547 937 car./s |
| Moteur sans NER | 385 | 0,28 ms | 1,24 ms | 4,14 ms | 0,45 ms | 5,52 ms | 456 041 car./s |

| Configuration | Court (< 200 car.) p50 / p95 | Moyen (200–1 000) p50 / p95 | Long (> 1 000) p50 / p95 |
| :--- | ---: | ---: | ---: |
| Règles seules | 0,20 / 0,75 ms (n=364) | 0,74 / 2,12 ms (n=11) | 1,91 / 3,80 ms (n=10) |
| Moteur sans NER | 0,27 / 0,77 ms (n=364) | 1,15 / 1,64 ms (n=11) | 2,88 / 5,52 ms (n=10) |

Temps mesuré autour de `detect()` en processus, après échauffement, hors réseau et hors politique côté serveur. Le chargement initial du modèle NER (n/a) n'est payé qu'une fois par processus.

## 7. Masquage : données encore lisibles après la passerelle

| Configuration | Masquées entièrement | Partiellement | Pas du tout |
| :--- | ---: | ---: | ---: |
| Règles seules | 52,1 % | 0,2 % | 47,7 % |
| Moteur sans NER | 52,1 % | 0,2 % | 47,7 % |

Détail pour **Moteur sans NER** :

| Type | Entités | Entièrement | Partiellement | Pas du tout |
| :--- | ---: | ---: | ---: | ---: |
| Nom de personne | 267 | 0 % | 0 % | 100 % |
| Organisation | 90 | 0 % | 0 % | 100 % |
| Adresse postale | 55 | 0 % | 0 % | 100 % |
| Montant financier | 54 | 96 % | 0 % | 4 % |
| Donnée médicale | 53 | 89 % | 4 % | 8 % |
| Fonction / poste | 44 | 0 % | 0 % | 100 % |
| Date de naissance | 43 | 95 % | 0 % | 5 % |
| Clé d'API | 39 | 100 % | 0 % | 0 % |
| IBAN | 38 | 100 % | 0 % | 0 % |
| Numéro d'assuré CNSS | 38 | 100 % | 0 % | 0 % |
| Salaire / cotisation | 36 | 100 % | 0 % | 0 % |
| Adresse e-mail | 27 | 100 % | 0 % | 0 % |
| Numéro de téléphone | 27 | 100 % | 0 % | 0 % |
| Identifiant interne | 27 | 100 % | 0 % | 0 % |
| Carte bancaire | 18 | 100 % | 0 % | 0 % |
| Identifiant national (NPI/IFU) | 17 | 94 % | 0 % | 6 % |
| Chaîne de connexion | 17 | 100 % | 0 % | 0 % |
| Numéro employeur CNSS | 16 | 100 % | 0 % | 0 % |
| Adresse IP | 15 | 100 % | 0 % | 0 % |
| URL interne | 15 | 100 % | 0 % | 0 % |
| Identifiant fiscal | 14 | 100 % | 0 % | 0 % |
| Numéro mobile money | 13 | 100 % | 0 % | 0 % |
| Mot de passe | 11 | 100 % | 0 % | 0 % |
| Clé privée | 1 | 100 % | 0 % | 0 % |

## 8. Expérience de ré-identification

Attaquant disposant du registre complet (2000 assurés synthétiques) et du prompt tel qu'il sort de la passerelle. **Ré-identifié** : un seul candidat compatible et c'est la bonne personne. **k ≤ 5** : la personne est parmi au plus 5 candidats.

| Configuration | direct : ré-id. / k≤5 | quasi-identifiants : ré-id. / k≤5 | identifiants : ré-id. / k≤5 | contact : ré-id. / k≤5 | Global : ré-id. | k médian |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sans passerelle (texte en clair) | 100 % / 100 % | 100 % / 100 % | 100 % / 100 % | 98 % / 100 % | 99,5 % | 1 |
| Règles seules | 100 % / 100 % | 66 % / 100 % | 0 % / 0 % | 90 % / 100 % | 64,0 % | 1 |
| Moteur sans NER | 100 % / 100 % | 66 % / 100 % | 0 % / 0 % | 90 % / 100 % | 64,0 % | 1 |

## 9. Réponse du scoring au risque de ré-identification

L'expérience précédente mesure le masquage seul. Ici, chaque scénario passe par le pipeline de décision complet de l'agent (score de risque → politiques équivalentes au seed → masquage → escalade sur quasi-identifiants résiduels), pour un utilisateur d'une direction à risque modéré écrivant à ChatGPT. Les scénarios sont classés selon leur exposition **en clair** (attaque sur le texte original). L'attaquant voit ensuite ce qui sort réellement : rien si BLOCK, le texte masqué si MASK, le texte en clair si ALLOW ou WARN. **Facteur neutralisé** : même pipeline avec le poids du facteur « combinaison de quasi-identifiants » à 0 et les trois autres renormalisés.

| Configuration | Facteur | Exposition en clair | n | Score moyen | Facteur QI moyen | Bandes faible/modérée/élevée/critique | ALLOW/WARN/MASK/BLOCK | Laissés en clair | Ré-identifiés après passerelle |
| :--- | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Règles seules | actif | Ré-identifiable en clair (k = 1) | 199 | 40.8 | 0 | 0/149/50/0 | 100/0/99/0 | 50 % | 73 % |
| Règles seules | actif | Quasi ré-identifiable (2 ≤ k ≤ 5) | 6 | 20.8 | 0 | 5/1/0/0 | 5/0/1/0 | 83 % | 0 % |
| Règles seules | actif | Peu exposé (k > 5) | 95 | 17 | 0 | 95/0/0/0 | 95/0/0/0 | 100 % | 0 % |
| Règles seules | neutralisé | Ré-identifiable en clair (k = 1) | 199 | 54.8 | 0 | 0/100/99/0 | 100/0/99/0 | 50 % | 73 % |
| Règles seules | neutralisé | Quasi ré-identifiable (2 ≤ k ≤ 5) | 6 | 27.2 | 0 | 5/0/1/0 | 5/0/1/0 | 83 % | 0 % |
| Règles seules | neutralisé | Peu exposé (k > 5) | 95 | 22 | 0 | 95/0/0/0 | 95/0/0/0 | 100 % | 0 % |
| Moteur sans NER | actif | Ré-identifiable en clair (k = 1) | 199 | 42 | 0 | 0/149/50/0 | 100/0/99/0 | 50 % | 73 % |
| Moteur sans NER | actif | Quasi ré-identifiable (2 ≤ k ≤ 5) | 6 | 20.8 | 0 | 5/1/0/0 | 5/0/1/0 | 83 % | 0 % |
| Moteur sans NER | actif | Peu exposé (k > 5) | 95 | 17 | 0 | 95/0/0/0 | 95/0/0/0 | 100 % | 0 % |
| Moteur sans NER | neutralisé | Ré-identifiable en clair (k = 1) | 199 | 55.8 | 0 | 0/50/149/0 | 50/50/99/0 | 50 % | 73 % |
| Moteur sans NER | neutralisé | Quasi ré-identifiable (2 ≤ k ≤ 5) | 6 | 27.2 | 0 | 5/0/1/0 | 5/0/1/0 | 83 % | 0 % |
| Moteur sans NER | neutralisé | Peu exposé (k > 5) | 95 | 22 | 0 | 95/0/0/0 | 95/0/0/0 | 100 % | 0 % |

### Effet du facteur selon le profil

Les tableaux ci-dessus portent sur un profil (direction à risque modéré, ChatGPT). L'effet d'un facteur dépend de la distance aux seuils de bande, donc du reste du score : l'ablation est rejouée ici sur 12 profils (niveau de risque de la direction × lieu d'hébergement du service) et comparée scénario par scénario, sur les 300 scénarios (ré-identification et témoins). « Plus stricte » : l'action est plus sévère avec le facteur qu'avec le facteur neutralisé.

| Configuration | Profil | Bandes changées | Actions changées (plus strictes / plus laxistes) | Écart exposés − témoins : actif / neutralisé | Ré-identifiables exploitables : actif / neutralisé | Exemples |
| :--- | :--- | ---: | ---: | ---: | ---: | :--- |
| Règles seules | LLM interne (BJ), direction à risque faible | 100 | 0 (0 / 0) | 24.5 / 32.3 | 145 / 145 | — |
| Règles seules | Mistral (UE), direction à risque faible | 100 | 0 (0 / 0) | 24.5 / 32.3 | 145 / 145 | — |
| Règles seules | ChatGPT (US), direction à risque faible | 100 | 0 (0 / 0) | 24.3 / 32.3 | 145 / 145 | — |
| Règles seules | DeepSeek (CN), direction à risque faible | 250 | 100 (0 / 100) | 24.5 / 32.3 | 145 / 145 | reid-direct-001 : WARN → ALLOW ; reid-direct-002 : WARN → ALLOW ; reid-direct-003 : WARN → ALLOW |
| Règles seules | LLM interne (BJ), direction à risque modéré | 150 | 0 (0 / 0) | 24.3 / 32.8 | 145 / 145 | — |
| Règles seules | Mistral (UE), direction à risque modéré | 50 | 0 (0 / 0) | 24.3 / 32.8 | 145 / 145 | — |
| Règles seules | ChatGPT (US), direction à risque modéré | 50 | 0 (0 / 0) | 23.8 / 32.8 | 145 / 145 | — |
| Règles seules | DeepSeek (CN), direction à risque modéré | 300 | 150 (0 / 150) | 24.3 / 32.8 | 145 / 145 | reid-direct-001 : WARN → ALLOW ; reid-direct-002 : WARN → ALLOW ; reid-direct-003 : WARN → ALLOW |
| Règles seules | LLM interne (BJ), direction à risque élevé | 50 | 0 (0 / 0) | 24.8 / 32 | 145 / 145 | — |
| Règles seules | Mistral (UE), direction à risque élevé | 250 | 100 (0 / 100) | 24.8 / 32 | 145 / 145 | reid-direct-001 : WARN → ALLOW ; reid-direct-002 : WARN → ALLOW ; reid-direct-003 : WARN → ALLOW |
| Règles seules | ChatGPT (US), direction à risque élevé | 250 | 100 (0 / 100) | 24.5 / 32.3 | 145 / 145 | reid-direct-001 : WARN → ALLOW ; reid-direct-002 : WARN → ALLOW ; reid-direct-003 : WARN → ALLOW |
| Règles seules | DeepSeek (CN), direction à risque élevé | 300 | 150 (0 / 150) | 24.8 / 32 | 145 / 145 | reid-direct-001 : WARN → ALLOW ; reid-direct-002 : WARN → ALLOW ; reid-direct-003 : WARN → ALLOW |
| Moteur sans NER | LLM interne (BJ), direction à risque faible | 50 | 0 (0 / 0) | 25.2 / 33.5 | 145 / 145 | — |
| Moteur sans NER | Mistral (UE), direction à risque faible | 150 | 50 (0 / 50) | 25.2 / 33.5 | 145 / 145 | reid-quasi-identifiants-001 : WARN → ALLOW ; reid-quasi-identifiants-002 : WARN → ALLOW ; reid-quasi-identifiants-003 : WARN → ALLOW |
| Moteur sans NER | ChatGPT (US), direction à risque faible | 150 | 50 (0 / 50) | 25 / 33.7 | 145 / 145 | reid-quasi-identifiants-001 : WARN → ALLOW ; reid-quasi-identifiants-002 : WARN → ALLOW ; reid-quasi-identifiants-003 : WARN → ALLOW |
| Moteur sans NER | DeepSeek (CN), direction à risque faible | 250 | 100 (0 / 100) | 25.2 / 33.5 | 145 / 145 | reid-direct-001 : WARN → ALLOW ; reid-direct-002 : WARN → ALLOW ; reid-direct-003 : WARN → ALLOW |
| Moteur sans NER | LLM interne (BJ), direction à risque modéré | 100 | 0 (0 / 0) | 25.3 / 33.8 | 145 / 145 | — |
| Moteur sans NER | Mistral (UE), direction à risque modéré | 100 | 50 (0 / 50) | 25.3 / 33.8 | 145 / 145 | reid-quasi-identifiants-001 : WARN → ALLOW ; reid-quasi-identifiants-002 : WARN → ALLOW ; reid-quasi-identifiants-003 : WARN → ALLOW |
| Moteur sans NER | ChatGPT (US), direction à risque modéré | 100 | 50 (0 / 50) | 25 / 33.8 | 145 / 145 | reid-quasi-identifiants-001 : WARN → ALLOW ; reid-quasi-identifiants-002 : WARN → ALLOW ; reid-quasi-identifiants-003 : WARN → ALLOW |
| Moteur sans NER | DeepSeek (CN), direction à risque modéré | 300 | 150 (0 / 150) | 25.3 / 33.8 | 145 / 145 | reid-direct-001 : WARN → ALLOW ; reid-direct-002 : WARN → ALLOW ; reid-direct-003 : WARN → ALLOW |
| Moteur sans NER | LLM interne (BJ), direction à risque élevé | 50 | 0 (0 / 0) | 25.8 / 34 | 145 / 145 | — |
| Moteur sans NER | Mistral (UE), direction à risque élevé | 150 | 100 (0 / 100) | 25.8 / 34 | 145 / 145 | reid-direct-001 : WARN → ALLOW ; reid-direct-002 : WARN → ALLOW ; reid-direct-003 : WARN → ALLOW |
| Moteur sans NER | ChatGPT (US), direction à risque élevé | 250 | 100 (0 / 100) | 25.5 / 34 | 145 / 145 | reid-direct-001 : WARN → ALLOW ; reid-direct-002 : WARN → ALLOW ; reid-direct-003 : WARN → ALLOW |
| Moteur sans NER | DeepSeek (CN), direction à risque élevé | 300 | 150 (0 / 150) | 25.8 / 34 | 145 / 145 | reid-direct-001 : WARN → ALLOW ; reid-direct-002 : WARN → ALLOW ; reid-direct-003 : WARN → ALLOW |

### Par variante de scénario (facteur actif)

| Configuration | direct : score moyen · ALLOW/WARN/MASK/BLOCK · ré-id. après | quasi-identifiants : score moyen · ALLOW/WARN/MASK/BLOCK · ré-id. après | identifiants : score moyen · ALLOW/WARN/MASK/BLOCK · ré-id. après | contact : score moyen · ALLOW/WARN/MASK/BLOCK · ré-id. après | temoin-commune : score moyen · ALLOW/WARN/MASK/BLOCK · ré-id. après | temoin-fonction : score moyen · ALLOW/WARN/MASK/BLOCK · ré-id. après |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| Règles seules | 36 · 50/0/0/0 · 100 % | 36 · 50/0/0/0 · 100 % | 51 · 0/0/50/0 · 0 % | 40 · 0/0/50/0 · 90 % | 17 · 50/0/0/0 · 0 % | 17 · 50/0/0/0 · 0 % |
| Moteur sans NER | 36 · 50/0/0/0 · 100 % | 40.8 · 50/0/0/0 · 100 % | 51 · 0/0/50/0 · 0 % | 40 · 0/0/50/0 · 90 % | 17 · 50/0/0/0 · 0 % | 17 · 50/0/0/0 · 0 % |

## 10. Analyse d'erreurs (Moteur sans NER)

### Données sensibles manquées (extrait, corpus manuel en premier)

| Prompt | Type attendu | Valeur | Contexte |
| :--- | :--- | :--- | :--- |
| man-003 | Nom de personne | `Jean Dupont` | Voici le CV de Jean Dupont, jean.dupont@cnss.bj, candida… |
| man-006 | Nom de personne | `Rosine Akakpo` | …crire un mail pour annoncer à Rosine Akakpo qu'elle n'a pas été retenue ?… |
| man-007 | Nom de personne | `KOSSI HOUNKANRIN` | Fiche de paie de KOSSI HOUNKANRIN — magasinier — salaire de bas… |
| man-007 | Fonction / poste | `magasinier` | …de paie de KOSSI HOUNKANRIN — magasinier — salaire de base 185 000 F, … |
| man-008 | Nom de personne | `mathias zinsou` | …ards répétés à l'attention de mathias zinsou (chauffeur), sans être trop d… |
| man-008 | Fonction / poste | `chauffeur` | …'attention de mathias zinsou (chauffeur), sans être trop dur stp |
| man-009 | Nom de personne | `Aïcha Yessoufou` | Liste des agents à former : Aïcha Yessoufou, Romuald Gbaguidi et Sidonie … |
| man-009 | Nom de personne | `Romuald Gbaguidi` | …s à former : Aïcha Yessoufou, Romuald Gbaguidi et Sidonie Tossou. Prévoir le… |
| man-009 | Nom de personne | `Sidonie Tossou` | …essoufou, Romuald Gbaguidi et Sidonie Tossou. Prévoir le déjeuner pour 3 p… |
| man-011 | Nom de personne | `Grâce Dossou` | … confirmons l'embauche de Mme Grâce Dossou, née le 7 juillet 1994, domic… |
| man-011 | Adresse postale | `Fidjrossè` | … 7 juillet 1994, domiciliée à Fidjrossè, en qualité de secrétaire de … |
| man-011 | Fonction / poste | `secrétaire de direction` | …ée à Fidjrossè, en qualité de secrétaire de direction. » |
| man-013 | Nom de personne | `Codjo Sossa` | …our le dossier retraite de M. Codjo Sossa (NPI 1093456728), il manque l… |
| man-013 | Organisation | `Imprimerie du Zou` | …station de l'ancien employeur Imprimerie du Zou. Rédige la relance. |
| man-014 | Nom de personne | `Hermann Lokossou` | …you translate into English: « Hermann Lokossou a été promu contrôleur de ges… |
| man-014 | Fonction / poste | `contrôleur de gestion` | … Hermann Lokossou a été promu contrôleur de gestion à compter du 1er janvier. » |
| man-017 | Nom de personne | `Félicité Agbo` | …r le Moov Money 0195873412 de Félicité Agbo et prépare le SMS de confirma… |
| man-019 | Organisation | `Boulangerie La Lagune` | …n échéancier pour l'employeur Boulangerie La Lagune, dette de 1.250.000 FCFA, en … |
| man-022 | Organisation | `Transports Alafia` | Société Transports Alafia, IFU 3201912345678 : rédige l… |
| man-022 | Identifiant fiscal | `3201912345678` | …ociété Transports Alafia, IFU 3201912345678 : rédige l'attestation de rég… |
| man-023 | Montant financier | `15000` | envoie 15000F a +229 01 51 22 33 44 sur MT… |
| man-024 | Montant financier | `275 000` | Le virement de 275 000 € a été reçu le 3 octobre, me… |
| man-026 | Organisation | `Groupe Atlantique Services` | … l'affaire opposant la CNSS à Groupe Atlantique Services devant le tribunal de commerc… |
| man-026 | Nom de personne | `Clarisse Tchibozo` | … Cotonou. Notre avocat est Me Clarisse Tchibozo. |
| man-028 | Nom de personne | `Hortense Assogba` | Mme Hortense Assogba conteste le refus de sa pensi… |

### Fausses alertes (extrait)

| Prompt | Type prédit | Texte détecté | Contexte |
| :--- | :--- | :--- | :--- |
| man-020 | Montant financier | `500 000` | …ale, exemples pour 100 000 et 500 000 FCFA. |
| man-022 | Identifiant national (NPI/IFU) | `3201912345678` | …ociété Transports Alafia, IFU 3201912345678 : rédige l'attestation de rég… |
| man-034 | Adresse IP | `8.8.8.8` | … IPv6 avec des exemples comme 8.8.8.8. |
| man-058 | Montant financier | `52 000` | …septembre 2023 fixe le SMIG à 52 000 FCFA. Explique son impact. |
| man-060 | Numéro de téléphone | `4111 2233` | …usé, et le numéro de commande 4111 2233 n'apparaît pas. Que faire ? |
| gen-020 | Identifiant national (NPI/IFU) | `3744748326841` | …ciété Société Ouémé Agro, IFU 3744748326841, virement vers BJ67 BE88 0450… |
| gen-129 | Identifiant national (NPI/IFU) | `1355227568084` | …été Collège Les Lauriers, IFU 1355227568084, virement vers BJ92BE71737077… |
| gen-140 | Identifiant national (NPI/IFU) | `1056795755318` | …té Savonnerie de l'Ouémé, IFU 1056795755318, virement vers BJ17BJ58649604… |
| gen-162 | Identifiant national (NPI/IFU) | `1951546735664` | …été Collège Les Lauriers, IFU 1951546735664, virement vers BJ53BE45057863… |
| gen-208 | Identifiant national (NPI/IFU) | `1678399941790` | …ociété Imprimerie du Zou, IFU 1678399941790, virement vers BJ64BE61054783… |
| gen-222 | Identifiant national (NPI/IFU) | `3859901067286` | …été Collège Les Lauriers, IFU 3859901067286, virement vers BJ72 CB40 9965… |
| gen-265 | Identifiant national (NPI/IFU) | `1988349248332` | …ociété Transports Alafia, IFU 1988349248332, virement vers BJ52 OB05 1407… |
| gen-267 | Identifiant national (NPI/IFU) | `1456870266338` | …ciété Hôtel Le Belvédère, IFU 1456870266338, virement vers BJ45EC27346898… |
| gen-275 | Identifiant national (NPI/IFU) | `3586345617741` | …té BTP Mono Construction, IFU 3586345617741, virement vers BJ59 EC43 5921… |
| gen-292 | Identifiant national (NPI/IFU) | `3980322183985` | …ciété Société Ouémé Agro, IFU 3980322183985, virement vers BJ47OB23934048… |
| gen-298 | Identifiant national (NPI/IFU) | `1459335215563` | …té Clinique Les Palmiers, IFU 1459335215563, virement vers BJ06 EC27 4680… |
| long-04 | Identifiant national (NPI/IFU) | `3761088055690` | …té Savonnerie de l'Ouémé, IFU 3761088055690, virement vers BJ81CB94807803… |
| long-13 | Identifiant national (NPI/IFU) | `1773237240861` | …ciété Société Ouémé Agro, IFU 1773237240861, virement vers BJ40OB43841459… |

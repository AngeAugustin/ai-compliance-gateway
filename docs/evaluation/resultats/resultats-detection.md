# Résultats de l'évaluation de la détection

> Rapport généré par `pnpm eval:detection` le 2026-11-12 — graine 2026, 3 répétitions de latence, Node 24.12.0 (win32-x64, Intel(R) Core(TM) i7-8650U CPU @ 1.90GHz), durée 666 s. Protocole : [protocole-detection.md](../protocole-detection.md). Ne pas modifier à la main.

NER : chargé en 6458 ms. LLM de contexte : non évalué (LLM_MODEL_PATH non renseigné).

## 1. Synthèse

| Configuration | Précision | Rappel | F1 (IC 95 %) | F1 strict | Rappel protection | Latence p50 / p95 |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Règles seules** | 96,5 % | 50,8 % | 66,6 % (63,8 % – 68,9 %) | 65,0 % | 52,4 % | 0,36 / 2,11 ms |
| **NER seul** | 78,5 % | 40,5 % | 53,4 % (50,7 % – 56,1 %) | 51,0 % | 42,6 % | 96,3 / 326 ms |
| **Moteur sans NER** | 96,5 % | 50,8 % | 66,6 % (63,8 % – 68,9 %) | 65,0 % | 52,4 % | 1,25 / 5,68 ms |
| **Moteur complet** | 90,1 % | 91,2 % | 90,6 % (89,1 % – 92,1 %) | 87,7 % | 93,5 % | 99,6 / 370 ms |

Appariement **partiel** (même type, chevauchement) sauf mention contraire, micro-moyenne sur tout le corpus. **Rappel protection** : part des données sensibles recouvertes par une détection, quel que soit le type — c'est ce qui conditionne le masquage.

## 2. Corpus

| Sous-corpus | Prompts |
| :--- | ---: |
| Manuel | 65 |
| Généré | 300 |
| Documents multi-demandes | 20 |

385 prompts, 976 entités annotées, 104 prompts sans aucune donnée sensible (négatifs). 200 scénarios supplémentaires pour l'expérience de ré-identification.

| Type | Entités annotées |
| :--- | ---: |
| Nom de personne | 267 |
| Organisation | 90 |
| Montant financier | 54 |
| Adresse postale | 54 |
| Donnée médicale | 54 |
| Fonction / poste | 44 |
| Date de naissance | 43 |
| Clé d'API | 39 |
| IBAN | 38 |
| Numéro d'assuré CNSS | 38 |
| Salaire / cotisation | 36 |
| Identifiant interne | 28 |
| Adresse e-mail | 27 |
| Numéro de téléphone | 27 |
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

Couche 1 (regex + validateurs), sortie brute. Macro-F1 (par type) : 77,1 %. F1 sur son périmètre déclaré : 95,8 %.

| Sous-ensemble | VP | FP | FN | Précision | Rappel | F1 |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| Tout — Strict | 484 | 30 | 492 | 94,2 % | 49,6 % | 65,0 % |
| Tout — Partiel | 496 | 18 | 480 | 96,5 % | 50,8 % | 66,6 % |
| Tout — Protection | 511 | 3 | 465 | 99,4 % | 52,4 % | 68,6 % |
| Manuel — Partiel | 44 | 5 | 54 | 89,8 % | 44,9 % | 59,9 % |
| Généré — Partiel | 263 | 11 | 275 | 96,0 % | 48,9 % | 64,8 % |
| Documents multi-demandes — Partiel | 189 | 2 | 151 | 99,0 % | 55,6 % | 71,2 % |

### NER seul

Couche 2 (BERT multilingue quantifié, transformers.js), sortie brute. Macro-F1 (par type) : 10,0 %. F1 sur son périmètre déclaré : 86,4 %.

| Sous-ensemble | VP | FP | FN | Précision | Rappel | F1 |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| Tout — Strict | 377 | 126 | 599 | 75,0 % | 38,6 % | 51,0 % |
| Tout — Partiel | 395 | 108 | 581 | 78,5 % | 40,5 % | 53,4 % |
| Tout — Protection | 416 | 87 | 560 | 82,7 % | 42,6 % | 56,3 % |
| Manuel — Partiel | 32 | 24 | 66 | 57,1 % | 32,7 % | 41,6 % |
| Généré — Partiel | 235 | 43 | 303 | 84,5 % | 43,7 % | 57,6 % |
| Documents multi-demandes — Partiel | 128 | 41 | 212 | 75,7 % | 37,6 % | 50,3 % |

### Moteur sans NER

Règles + mots-clés + réglages (seuils, contexte) — mode dégradé. Macro-F1 (par type) : 77,1 %. F1 sur son périmètre déclaré : 95,8 %.

| Sous-ensemble | VP | FP | FN | Précision | Rappel | F1 |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| Tout — Strict | 484 | 30 | 492 | 94,2 % | 49,6 % | 65,0 % |
| Tout — Partiel | 496 | 18 | 480 | 96,5 % | 50,8 % | 66,6 % |
| Tout — Protection | 511 | 3 | 465 | 99,4 % | 52,4 % | 68,6 % |
| Manuel — Partiel | 44 | 5 | 54 | 89,8 % | 44,9 % | 59,9 % |
| Généré — Partiel | 263 | 11 | 275 | 96,0 % | 48,9 % | 64,8 % |
| Documents multi-demandes — Partiel | 189 | 2 | 151 | 99,0 % | 55,6 % | 71,2 % |

### Moteur complet

Règles + NER + mots-clés + réglages — configuration de production. Macro-F1 (par type) : 87,5 %. F1 sur son périmètre déclaré : 92,7 %.

| Sous-ensemble | VP | FP | FN | Précision | Rappel | F1 |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| Tout — Strict | 861 | 127 | 115 | 87,1 % | 88,2 % | 87,7 % |
| Tout — Partiel | 890 | 98 | 86 | 90,1 % | 91,2 % | 90,6 % |
| Tout — Protection | 913 | 75 | 63 | 92,4 % | 93,5 % | 93,0 % |
| Manuel — Partiel | 76 | 24 | 22 | 76,0 % | 77,6 % | 76,8 % |
| Généré — Partiel | 498 | 37 | 40 | 93,1 % | 92,6 % | 92,8 % |
| Documents multi-demandes — Partiel | 316 | 37 | 24 | 89,5 % | 92,9 % | 91,2 % |

## 4. Résultats par type d'entité (F1 partiel)

| Type | Support | Règles seules | NER seul | Moteur sans NER | Moteur complet |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Nom de personne | 267 | hors périmètre | 97 % (R 97 %) | hors périmètre | 97 % (R 97 %) |
| Organisation | 90 | hors périmètre | 73 % (R 96 %) | hors périmètre | 80 % (R 96 %) |
| Adresse postale | 54 | hors périmètre | 69 % (R 91 %) | hors périmètre | 73 % (R 91 %) |
| Montant financier | 54 | 96 % (R 96 %) | hors périmètre | 96 % (R 96 %) | 96 % (R 96 %) |
| Donnée médicale | 54 | 95 % (R 91 %) | hors périmètre | 95 % (R 91 %) | 95 % (R 91 %) |
| Fonction / poste | 44 | hors périmètre | hors périmètre | hors périmètre | hors périmètre |
| Date de naissance | 43 | 98 % (R 95 %) | hors périmètre | 98 % (R 95 %) | 98 % (R 95 %) |
| Clé d'API | 39 | 100 % (R 100 %) | hors périmètre | 100 % (R 100 %) | 100 % (R 100 %) |
| Numéro d'assuré CNSS | 38 | 100 % (R 100 %) | hors périmètre | 100 % (R 100 %) | 100 % (R 100 %) |
| IBAN | 38 | 100 % (R 100 %) | hors périmètre | 100 % (R 100 %) | 100 % (R 100 %) |
| Salaire / cotisation | 36 | 100 % (R 100 %) | hors périmètre | 100 % (R 100 %) | 100 % (R 100 %) |
| Identifiant interne | 28 | 98 % (R 96 %) | hors périmètre | 98 % (R 96 %) | 98 % (R 96 %) |
| Adresse e-mail | 27 | 100 % (R 100 %) | hors périmètre | 100 % (R 100 %) | 100 % (R 100 %) |
| Numéro de téléphone | 27 | 98 % (R 100 %) | hors périmètre | 98 % (R 100 %) | 98 % (R 100 %) |
| Carte bancaire | 18 | 100 % (R 100 %) | hors périmètre | 100 % (R 100 %) | 100 % (R 100 %) |
| Chaîne de connexion | 17 | 100 % (R 100 %) | hors périmètre | 100 % (R 100 %) | 100 % (R 100 %) |
| Identifiant national (NPI/IFU) | 17 | 68 % (R 94 %) | hors périmètre | 68 % (R 94 %) | 68 % (R 94 %) |
| Numéro employeur CNSS | 16 | 100 % (R 100 %) | hors périmètre | 100 % (R 100 %) | 100 % (R 100 %) |
| URL interne | 15 | 100 % (R 100 %) | hors périmètre | 100 % (R 100 %) | 100 % (R 100 %) |
| Adresse IP | 15 | 97 % (R 100 %) | hors périmètre | 97 % (R 100 %) | 97 % (R 100 %) |
| Identifiant fiscal | 14 | 0 % (R 0 %) | hors périmètre | 0 % (R 0 %) | 0 % (R 0 %) |
| Numéro mobile money | 13 | 100 % (R 100 %) | hors périmètre | 100 % (R 100 %) | 100 % (R 100 %) |
| Mot de passe | 11 | 100 % (R 100 %) | hors périmètre | 100 % (R 100 %) | 100 % (R 100 %) |
| Clé privée | 1 | 100 % (R 100 %) | hors périmètre | 100 % (R 100 %) | 100 % (R 100 %) |

« hors périmètre » : la configuration ne produit jamais ce type ; ses occurrences comptent comme faux négatifs dans les totaux.

Faux positifs les plus fréquents :

- **Règles seules** : Identifiant national (NPI/IFU) (14), Montant financier (2), Numéro de téléphone (1), Adresse IP (1)
- **NER seul** : Organisation (59), Adresse postale (39), Nom de personne (10)
- **Moteur sans NER** : Identifiant national (NPI/IFU) (14), Montant financier (2), Numéro de téléphone (1), Adresse IP (1)
- **Moteur complet** : Organisation (39), Adresse postale (32), Identifiant national (NPI/IFU) (14), Nom de personne (9), Montant financier (2), Numéro de téléphone (1)

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

## 6. Latence

| Configuration | Mesures | p50 | p95 | p99 | Moyenne | Max | Débit |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Règles seules | 1155 | 0,36 ms | 2,11 ms | 6,25 ms | 0,70 ms | 25,9 ms | 293 200 car./s |
| NER seul | 1155 | 96,3 ms | 326 ms | 1504 ms | 144 ms | 3938 ms | 1 420 car./s |
| Moteur sans NER | 1155 | 1,25 ms | 5,68 ms | 16,6 ms | 2,04 ms | 25,1 ms | 99 916 car./s |
| Moteur complet | 1155 | 99,6 ms | 370 ms | 1835 ms | 161 ms | 3309 ms | 1 263 car./s |

| Configuration | Court (< 200 car.) p50 / p95 | Moyen (200–1 000) p50 / p95 | Long (> 1 000) p50 / p95 |
| :--- | ---: | ---: | ---: |
| Règles seules | 0,33 / 1,50 ms (n=1092) | 1,37 / 2,69 ms (n=33) | 3,73 / 11,7 ms (n=30) |
| NER seul | 94,4 / 164 ms (n=1092) | 414 / 537 ms (n=33) | 1336 / 2552 ms (n=30) |
| Moteur sans NER | 1,19 / 3,99 ms (n=1092) | 5,01 / 9,67 ms (n=33) | 14,6 / 24,6 ms (n=30) |
| Moteur complet | 97,0 / 168 ms (n=1092) | 532 / 699 ms (n=33) | 1768 / 3263 ms (n=30) |

Temps mesuré autour de `detect()` en processus, après échauffement, hors réseau et hors politique côté serveur. Le chargement initial du modèle NER (6458 ms) n'est payé qu'une fois par processus.

## 7. Masquage : données encore lisibles après la passerelle

| Configuration | Masquées entièrement | Partiellement | Pas du tout |
| :--- | ---: | ---: | ---: |
| Règles seules | 52,2 % | 0,2 % | 47,6 % |
| NER seul | 40,4 % | 2,3 % | 57,4 % |
| Moteur sans NER | 52,2 % | 0,2 % | 47,6 % |
| Moteur complet | 92,3 % | 1,2 % | 6,5 % |

Détail pour **Moteur complet** :

| Type | Entités | Entièrement | Partiellement | Pas du tout |
| :--- | ---: | ---: | ---: | ---: |
| Nom de personne | 267 | 96 % | 2 % | 1 % |
| Organisation | 90 | 92 % | 3 % | 4 % |
| Montant financier | 54 | 96 % | 0 % | 4 % |
| Adresse postale | 54 | 96 % | 2 % | 2 % |
| Donnée médicale | 54 | 87 % | 4 % | 9 % |
| Fonction / poste | 44 | 0 % | 0 % | 100 % |
| Date de naissance | 43 | 95 % | 0 % | 5 % |
| Clé d'API | 39 | 100 % | 0 % | 0 % |
| IBAN | 38 | 100 % | 0 % | 0 % |
| Numéro d'assuré CNSS | 38 | 100 % | 0 % | 0 % |
| Salaire / cotisation | 36 | 100 % | 0 % | 0 % |
| Identifiant interne | 28 | 100 % | 0 % | 0 % |
| Adresse e-mail | 27 | 100 % | 0 % | 0 % |
| Numéro de téléphone | 27 | 100 % | 0 % | 0 % |
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
| NER seul | 98 % / 100 % | 100 % / 100 % | 100 % / 100 % | 80 % / 98 % | 94,5 % | 1 |
| Moteur sans NER | 100 % / 100 % | 66 % / 100 % | 0 % / 0 % | 90 % / 100 % | 64,0 % | 1 |
| Moteur complet | 0 % / 0 % | 0 % / 2 % | 0 % / 0 % | 8 % / 18 % | 2,0 % | 77 |

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
| NER seul | actif | Ré-identifiable en clair (k = 1) | 199 | 41.9 | 31.7 | 50/91/58/0 | 141/0/58/0 | 71 % | 99 % |
| NER seul | actif | Quasi ré-identifiable (2 ≤ k ≤ 5) | 6 | 38 | 5.8 | 0/6/0/0 | 6/0/0/0 | 100 % | 0 % |
| NER seul | actif | Peu exposé (k > 5) | 95 | 36 | 0 | 0/95/0/0 | 95/0/0/0 | 100 % | 0 % |
| NER seul | neutralisé | Ré-identifiable en clair (k = 1) | 199 | 45.2 | 31.7 | 50/42/107/0 | 92/49/58/0 | 71 % | 99 % |
| NER seul | neutralisé | Quasi ré-identifiable (2 ≤ k ≤ 5) | 6 | 49.7 | 5.8 | 0/5/1/0 | 5/1/0/0 | 100 % | 0 % |
| NER seul | neutralisé | Peu exposé (k > 5) | 95 | 49 | 0 | 0/95/0/0 | 95/0/0/0 | 100 % | 0 % |
| Moteur sans NER | actif | Ré-identifiable en clair (k = 1) | 199 | 42 | 0 | 0/149/50/0 | 100/0/99/0 | 50 % | 73 % |
| Moteur sans NER | actif | Quasi ré-identifiable (2 ≤ k ≤ 5) | 6 | 20.8 | 0 | 5/1/0/0 | 5/0/1/0 | 83 % | 0 % |
| Moteur sans NER | actif | Peu exposé (k > 5) | 95 | 17 | 0 | 95/0/0/0 | 95/0/0/0 | 100 % | 0 % |
| Moteur sans NER | neutralisé | Ré-identifiable en clair (k = 1) | 199 | 55.8 | 0 | 0/50/149/0 | 50/50/99/0 | 50 % | 73 % |
| Moteur sans NER | neutralisé | Quasi ré-identifiable (2 ≤ k ≤ 5) | 6 | 27.2 | 0 | 5/0/1/0 | 5/0/1/0 | 83 % | 0 % |
| Moteur sans NER | neutralisé | Peu exposé (k > 5) | 95 | 22 | 0 | 95/0/0/0 | 95/0/0/0 | 100 % | 0 % |
| Moteur complet | actif | Ré-identifiable en clair (k = 1) | 199 | 58.1 | 50.7 | 0/0/199/0 | 0/3/196/0 | 2 % | 4 % |
| Moteur complet | actif | Quasi ré-identifiable (2 ≤ k ≤ 5) | 6 | 39.7 | 10 | 0/5/1/0 | 5/0/1/0 | 83 % | 0 % |
| Moteur complet | actif | Peu exposé (k > 5) | 95 | 36 | 0 | 0/95/0/0 | 95/0/0/0 | 100 % | 0 % |
| Moteur complet | neutralisé | Ré-identifiable en clair (k = 1) | 199 | 60.3 | 50.7 | 0/0/199/0 | 0/3/196/0 | 2 % | 4 % |
| Moteur complet | neutralisé | Quasi ré-identifiable (2 ≤ k ≤ 5) | 6 | 49.5 | 10 | 0/5/1/0 | 5/0/1/0 | 83 % | 0 % |
| Moteur complet | neutralisé | Peu exposé (k > 5) | 95 | 48 | 0 | 0/95/0/0 | 95/0/0/0 | 100 % | 0 % |

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
| NER seul | LLM interne (BJ), direction à risque faible | 110 | 0 (0 / 0) | 5.2 / -3.6 | 198 / 198 | — |
| NER seul | Mistral (UE), direction à risque faible | 2 | 2 (0 / 2) | 5.2 / -3.6 | 198 / 198 | reid-quasi-identifiants-004 : WARN → ALLOW ; reid-quasi-identifiants-005 : WARN → ALLOW |
| NER seul | ChatGPT (US), direction à risque faible | 47 | 47 (0 / 47) | 4.9 / -3.4 | 198 / 198 | reid-quasi-identifiants-004 : WARN → ALLOW ; reid-quasi-identifiants-005 : WARN → ALLOW ; reid-quasi-identifiants-010 : WARN → ALLOW |
| NER seul | DeepSeek (CN), direction à risque faible | 193 | 143 (0 / 143) | 5.2 / -3.6 | 198 / 198 | reid-quasi-identifiants-001 : WARN → ALLOW ; reid-quasi-identifiants-002 : WARN → ALLOW ; reid-quasi-identifiants-003 : WARN → ALLOW |
| NER seul | LLM interne (BJ), direction à risque modéré | 109 | 0 (0 / 0) | 5.2 / -3.8 | 198 / 198 | — |
| NER seul | Mistral (UE), direction à risque modéré | 50 | 50 (0 / 50) | 5.2 / -3.8 | 198 / 198 | reid-quasi-identifiants-004 : WARN → ALLOW ; reid-quasi-identifiants-005 : WARN → ALLOW ; reid-quasi-identifiants-010 : WARN → ALLOW |
| NER seul | ChatGPT (US), direction à risque modéré | 50 | 50 (0 / 50) | 5.9 / -3.8 | 198 / 198 | reid-quasi-identifiants-004 : WARN → ALLOW ; reid-quasi-identifiants-005 : WARN → ALLOW ; reid-quasi-identifiants-010 : WARN → ALLOW |
| NER seul | DeepSeek (CN), direction à risque modéré | 160 | 110 (0 / 110) | 5.2 / -3.8 | 198 / 198 | reid-quasi-identifiants-020 : WARN → ALLOW ; reid-quasi-identifiants-045 : WARN → ALLOW ; reid-contact-009 : WARN → ALLOW |
| NER seul | LLM interne (BJ), direction à risque élevé | 0 | 0 (0 / 0) | 5.4 / -3.6 | 198 / 198 | — |
| NER seul | Mistral (UE), direction à risque élevé | 195 | 145 (0 / 145) | 5.4 / -3.6 | 198 / 198 | reid-quasi-identifiants-001 : WARN → ALLOW ; reid-quasi-identifiants-002 : WARN → ALLOW ; reid-quasi-identifiants-003 : WARN → ALLOW |
| NER seul | ChatGPT (US), direction à risque élevé | 193 | 143 (0 / 143) | 5.2 / -3.6 | 198 / 198 | reid-quasi-identifiants-001 : WARN → ALLOW ; reid-quasi-identifiants-002 : WARN → ALLOW ; reid-quasi-identifiants-003 : WARN → ALLOW |
| NER seul | DeepSeek (CN), direction à risque élevé | 160 | 110 (0 / 110) | 5.4 / -3.6 | 198 / 198 | reid-quasi-identifiants-020 : WARN → ALLOW ; reid-quasi-identifiants-045 : WARN → ALLOW ; reid-contact-009 : WARN → ALLOW |
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
| Moteur complet | LLM interne (BJ), direction à risque faible | 158 | 0 (0 / 0) | 21.1 / 11.4 | 7 / 7 | — |
| Moteur complet | Mistral (UE), direction à risque faible | 60 | 1 (0 / 1) | 21.1 / 11.4 | 7 / 7 | reid-quasi-identifiants-045 : WARN → ALLOW |
| Moteur complet | ChatGPT (US), direction à risque faible | 60 | 1 (0 / 1) | 22.1 / 11.7 | 7 / 7 | reid-quasi-identifiants-045 : WARN → ALLOW |
| Moteur complet | DeepSeek (CN), direction à risque faible | 100 | 100 (0 / 100) | 21.1 / 11.4 | 7 / 7 | reid-temoin-commune-001 : WARN → ALLOW ; reid-temoin-commune-002 : WARN → ALLOW ; reid-temoin-commune-003 : WARN → ALLOW |
| Moteur complet | LLM interne (BJ), direction à risque modéré | 208 | 0 (0 / 0) | 21.1 / 12.3 | 7 / 7 | — |
| Moteur complet | Mistral (UE), direction à risque modéré | 9 | 0 (0 / 0) | 21.1 / 12.3 | 7 / 7 | — |
| Moteur complet | ChatGPT (US), direction à risque modéré | 0 | 0 (0 / 0) | 22.1 / 12.3 | 7 / 7 | — |
| Moteur complet | DeepSeek (CN), direction à risque modéré | 151 | 151 (1 / 150) | 21.1 / 12.3 | 7 / 7 | reid-quasi-identifiants-034 : MASK → BLOCK ; reid-identifiants-001 : BLOCK → MASK ; reid-identifiants-002 : BLOCK → MASK |
| Moteur complet | LLM interne (BJ), direction à risque élevé | 110 | 0 (0 / 0) | 21.4 / 11.4 | 7 / 7 | — |
| Moteur complet | Mistral (UE), direction à risque élevé | 100 | 100 (0 / 100) | 21.4 / 11.4 | 7 / 7 | reid-temoin-commune-001 : WARN → ALLOW ; reid-temoin-commune-002 : WARN → ALLOW ; reid-temoin-commune-003 : WARN → ALLOW |
| Moteur complet | ChatGPT (US), direction à risque élevé | 100 | 100 (0 / 100) | 21.3 / 11.4 | 7 / 7 | reid-temoin-commune-001 : WARN → ALLOW ; reid-temoin-commune-002 : WARN → ALLOW ; reid-temoin-commune-003 : WARN → ALLOW |
| Moteur complet | DeepSeek (CN), direction à risque élevé | 157 | 157 (7 / 150) | 21.4 / 11.4 | 7 / 7 | reid-quasi-identifiants-013 : MASK → BLOCK ; reid-quasi-identifiants-031 : MASK → BLOCK ; reid-quasi-identifiants-032 : MASK → BLOCK |

### Par variante de scénario (facteur actif)

| Configuration | direct : score moyen · ALLOW/WARN/MASK/BLOCK · ré-id. après | quasi-identifiants : score moyen · ALLOW/WARN/MASK/BLOCK · ré-id. après | identifiants : score moyen · ALLOW/WARN/MASK/BLOCK · ré-id. après | contact : score moyen · ALLOW/WARN/MASK/BLOCK · ré-id. après | temoin-commune : score moyen · ALLOW/WARN/MASK/BLOCK · ré-id. après | temoin-fonction : score moyen · ALLOW/WARN/MASK/BLOCK · ré-id. après |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| Règles seules | 36 · 50/0/0/0 · 100 % | 36 · 50/0/0/0 · 100 % | 51 · 0/0/50/0 · 0 % | 40 · 0/0/50/0 · 90 % | 17 · 50/0/0/0 · 0 % | 17 · 50/0/0/0 · 0 % |
| NER seul | 57 · 0/0/50/0 · 98 % | 47.5 · 42/0/8/0 · 100 % | 17 · 50/0/0/0 · 100 % | 46.1 · 50/0/0/0 · 98 % | 36 · 50/0/0/0 · 0 % | 36 · 50/0/0/0 · 0 % |
| Moteur sans NER | 36 · 50/0/0/0 · 100 % | 40.8 · 50/0/0/0 · 100 % | 51 · 0/0/50/0 · 0 % | 40 · 0/0/50/0 · 90 % | 17 · 50/0/0/0 · 0 % | 17 · 50/0/0/0 · 0 % |
| Moteur complet | 65 · 0/0/50/0 · 0 % | 59.6 · 0/3/47/0 · 6 % | 51 · 0/0/50/0 · 0 % | 56.6 · 0/0/50/0 · 8 % | 36 · 50/0/0/0 · 0 % | 36 · 50/0/0/0 · 0 % |

## 10. Analyse d'erreurs (Moteur complet)

### Données sensibles manquées (extrait, corpus manuel en premier)

| Prompt | Type attendu | Valeur | Contexte |
| :--- | :--- | :--- | :--- |
| man-003 | Nom de personne | `Jean Dupont` | Voici le CV de Jean Dupont, jean.dupont@cnss.bj, candida… |
| man-007 | Fonction / poste | `magasinier` | …de paie de KOSSI HOUNKANRIN — magasinier — salaire de base 185 000 F, … |
| man-008 | Nom de personne | `mathias zinsou` | …ards répétés à l'attention de mathias zinsou (chauffeur), sans être trop d… |
| man-008 | Fonction / poste | `chauffeur` | …'attention de mathias zinsou (chauffeur), sans être trop dur stp |
| man-011 | Fonction / poste | `secrétaire de direction` | …ée à Fidjrossè, en qualité de secrétaire de direction. » |
| man-014 | Fonction / poste | `contrôleur de gestion` | … Hermann Lokossou a été promu contrôleur de gestion à compter du 1er janvier. » |
| man-022 | Identifiant fiscal | `3201912345678` | …ociété Transports Alafia, IFU 3201912345678 : rédige l'attestation de rég… |
| man-023 | Montant financier | `15000` | envoie 15000F a +229 01 51 22 33 44 sur MT… |
| man-024 | Montant financier | `275 000` | Le virement de 275 000 € a été reçu le 3 octobre, me… |
| man-041 | Fonction / poste | `aide-soignante` | …ge pour Nafissatou Bio Sanni, aide-soignante à la Clinique Les Palmiers, s… |
| man-041 | Donnée médicale | `drépanocytose` | …Les Palmiers, suivie pour une drépanocytose depuis l'enfance. |
| man-044 | Donnée médicale | `séropositif` | M. Ange Houénou est séropositif, il demande que son employeur… |
| man-045 | Donnée médicale | `metformine 850 mg matin et soir` | Ordonnance : metformine 850 mg matin et soir, pour diabète de type 2. Pati… |
| man-045 | Nom de personne | `Comlan Ahouandjinou` | … diabète de type 2. Patient : Comlan Ahouandjinou, 12/04/1968. |
| man-045 | Date de naissance | `12/04/1968` | …atient : Comlan Ahouandjinou, 12/04/1968. |
| man-046 | Donnée médicale | `AVC` | Ma collègue a eu un AVC la semaine dernière, comment … |
| man-056 | Fonction / poste | `électricien` | …e ? « Boris Amoussou, 34 ans, électricien chez BTP Mono Construction, h… |
| man-060 | Identifiant interne | `4111 2233` | …usé, et le numéro de commande 4111 2233 n'apparaît pas. Que faire ? |
| man-061 | Date de naissance | `1985-06-21` | …ntrôle médical, Gildas Sagbo, 1985-06-21, 2045789013, déclare une hern… |
| man-061 | Identifiant national (NPI/IFU) | `2045789013` | …al, Gildas Sagbo, 1985-06-21, 2045789013, déclare une hernie discale s… |
| man-061 | Donnée médicale | `hernie discale` | …6-21, 2045789013, déclare une hernie discale suite à un accident du travai… |
| man-063 | Fonction / poste | `chef de garage` | …ou, 32 ans de service, ancien chef de garage. Ton chaleureux. |
| gen-002 | Organisation | `Transports Alafia` | …se en demeure à l'encontre de Transports Alafia pour non-déclaration de Gisèl… |
| gen-015 | Fonction / poste | `enseignant` | …il de Mme Gisèle Gnonlonfoun, enseignant, pour un salaire brut mensuel… |
| gen-020 | Identifiant fiscal | `3744748326841` | …ciété Société Ouémé Agro, IFU 3744748326841, virement vers BJ67 BE88 0450… |

### Fausses alertes (extrait)

| Prompt | Type prédit | Texte détecté | Contexte |
| :--- | :--- | :--- | :--- |
| man-002 | Organisation | `FCFA` | Envoie 80 000 FCFA via MoMo 01 97 12 34 56 à l'a… |
| man-007 | Organisation | `SSI` | Fiche de paie de KOSSI HOUNKANRIN — magasinier — sal… |
| man-007 | Nom de personne | `HO` | Fiche de paie de KOSSI HOUNKANRIN — magasinier — salair… |
| man-020 | Montant financier | `500 000` | …ale, exemples pour 100 000 et 500 000 FCFA. |
| man-022 | Identifiant national (NPI/IFU) | `3201912345678` | …ociété Transports Alafia, IFU 3201912345678 : rédige l'attestation de rég… |
| man-026 | Organisation | `CNSS` | …ns dans l'affaire opposant la CNSS à Groupe Atlantique Services … |
| man-026 | Organisation | `tribunal de commerce` | …Atlantique Services devant le tribunal de commerce de Cotonou. Notre avocat est … |
| man-026 | Adresse postale | `Cotonou` | …nt le tribunal de commerce de Cotonou. Notre avocat est Me Clarisse… |
| man-027 | Adresse postale | `Bénin` | …s vers un prestataire hors du Bénin ? |
| man-029 | Organisation | `APDP` | …orme aux recommandations de l'APDP. |
| man-031 | Organisation | `Prisma` | …is://10.20.4.18:6379 pourquoi Prisma ne se connecte pas ? |
| man-032 | Organisation | `GitHub` | …KDM — comment je la mets dans GitHub Actions ? |
| man-034 | Adresse IP | `8.8.8.8` | … IPv6 avec des exemples comme 8.8.8.8. |
| man-043 | Adresse postale | `Bénin` | …professionnelles reconnues au Bénin, avec un tableau. |
| man-045 | Adresse postale | `Comlan Ahouandjinou` | … diabète de type 2. Patient : Comlan Ahouandjinou, 12/04/1968. |
| man-048 | Adresse postale | `Parakou` | … Les agent de la direction de Parakou sont convié a la reunion du 1… |
| man-050 | Organisation | `CNSS` | Quel est le numéro vert de la CNSS pour les assurés ? Fais une a… |
| man-058 | Montant financier | `52 000` | …septembre 2023 fixe le SMIG à 52 000 FCFA. Explique son impact. |
| man-059 | Adresse postale | `Cotonou` | …u, carré 1245, quartier Agla, Cotonou, demande une attestation de c… |
| man-060 | Numéro de téléphone | `4111 2233` | …usé, et le numéro de commande 4111 2233 n'apparaît pas. Que faire ? |
| man-064 | Adresse postale | `Malanville` | …terne la liste des assurés de Malanville avec leurs numéros de télépho… |
| man-064 | Organisation | `RGPD/APDP` | …léphone ? Quelles précautions RGPD/APDP ? |
| man-065 | Organisation | `LinkedIn` | Rédige un post LinkedIn pour célébrer les 55 ans de l… |
| man-065 | Organisation | `CNSS` | …our célébrer les 55 ans de la CNSS, ton institutionnel, avec tro… |
| gen-012 | Organisation | `Bénin` | …le et cotisation patronale au Bénin, avec un exemple chiffré simp… |

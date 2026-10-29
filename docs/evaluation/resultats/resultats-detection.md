# Résultats de l'évaluation de la détection

> Rapport généré par `pnpm eval:detection` le 2026-10-29 — graine 2026, 3 répétitions de latence, Node 24.12.0 (win32-x64, Intel(R) Core(TM) i7-8650U CPU @ 1.90GHz), durée 361 s. Protocole : [protocole-detection.md](../protocole-detection.md). Ne pas modifier à la main.

NER : chargé en 2538 ms. LLM de contexte : non évalué (LLM_MODEL_PATH non renseigné).

## 1. Synthèse

| Configuration | Précision | Rappel | F1 (IC 95 %) | F1 strict | Rappel protection | Latence p50 / p95 |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Règles seules** | 96,5 % | 50,9 % | 66,6 % (63,8 % – 69,0 %) | 65,0 % | 52,3 % | 0,14 / 0,69 ms |
| **NER seul** | 78,7 % | 40,6 % | 53,6 % (50,9 % – 56,3 %) | 51,2 % | 42,8 % | 68,8 / 227 ms |
| **Moteur sans NER** | 96,5 % | 50,9 % | 66,6 % (63,8 % – 69,0 %) | 65,0 % | 52,3 % | 0,27 / 0,92 ms |
| **Moteur complet** | 90,2 % | 91,4 % | 90,8 % (89,3 % – 92,2 %) | 87,8 % | 93,6 % | 68,6 / 238 ms |

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

### NER seul

Couche 2 (BERT multilingue quantifié, transformers.js), sortie brute. Macro-F1 (par type) : 10,0 %. F1 sur son périmètre déclaré : 86,6 %.

| Sous-ensemble | VP | FP | FN | Précision | Rappel | F1 |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| Tout — Strict | 378 | 125 | 597 | 75,1 % | 38,8 % | 51,2 % |
| Tout — Partiel | 396 | 107 | 579 | 78,7 % | 40,6 % | 53,6 % |
| Tout — Protection | 417 | 86 | 558 | 82,9 % | 42,8 % | 56,4 % |
| Manuel — Partiel | 33 | 23 | 64 | 58,9 % | 34,0 % | 43,1 % |
| Généré — Partiel | 235 | 43 | 303 | 84,5 % | 43,7 % | 57,6 % |
| Documents multi-demandes — Partiel | 128 | 41 | 212 | 75,7 % | 37,6 % | 50,3 % |

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

### Moteur complet

Règles + NER + mots-clés + réglages — configuration de production. Macro-F1 (par type) : 87,6 %. F1 sur son périmètre déclaré : 92,9 %.

| Sous-ensemble | VP | FP | FN | Précision | Rappel | F1 |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| Tout — Strict | 862 | 126 | 113 | 87,2 % | 88,4 % | 87,8 % |
| Tout — Partiel | 891 | 97 | 84 | 90,2 % | 91,4 % | 90,8 % |
| Tout — Protection | 913 | 75 | 62 | 92,4 % | 93,6 % | 93,0 % |
| Manuel — Partiel | 77 | 23 | 20 | 77,0 % | 79,4 % | 78,2 % |
| Généré — Partiel | 498 | 37 | 40 | 93,1 % | 92,6 % | 92,8 % |
| Documents multi-demandes — Partiel | 316 | 37 | 24 | 89,5 % | 92,9 % | 91,2 % |

## 4. Résultats par type d'entité (F1 partiel)

| Type | Support | Règles seules | NER seul | Moteur sans NER | Moteur complet |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Nom de personne | 267 | hors périmètre | 97 % (R 97 %) | hors périmètre | 97 % (R 97 %) |
| Organisation | 90 | hors périmètre | 73 % (R 96 %) | hors périmètre | 80 % (R 96 %) |
| Adresse postale | 55 | hors périmètre | 70 % (R 91 %) | hors périmètre | 74 % (R 91 %) |
| Montant financier | 54 | 96 % (R 96 %) | hors périmètre | 96 % (R 96 %) | 96 % (R 96 %) |
| Donnée médicale | 53 | 96 % (R 92 %) | hors périmètre | 96 % (R 92 %) | 96 % (R 92 %) |
| Fonction / poste | 44 | hors périmètre | hors périmètre | hors périmètre | hors périmètre |
| Date de naissance | 43 | 98 % (R 95 %) | hors périmètre | 98 % (R 95 %) | 98 % (R 95 %) |
| Clé d'API | 39 | 100 % (R 100 %) | hors périmètre | 100 % (R 100 %) | 100 % (R 100 %) |
| Numéro d'assuré CNSS | 38 | 100 % (R 100 %) | hors périmètre | 100 % (R 100 %) | 100 % (R 100 %) |
| IBAN | 38 | 100 % (R 100 %) | hors périmètre | 100 % (R 100 %) | 100 % (R 100 %) |
| Salaire / cotisation | 36 | 100 % (R 100 %) | hors périmètre | 100 % (R 100 %) | 100 % (R 100 %) |
| Adresse e-mail | 27 | 100 % (R 100 %) | hors périmètre | 100 % (R 100 %) | 100 % (R 100 %) |
| Identifiant interne | 27 | 100 % (R 100 %) | hors périmètre | 100 % (R 100 %) | 100 % (R 100 %) |
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
- **NER seul** : Organisation (59), Adresse postale (38), Nom de personne (10)
- **Moteur sans NER** : Identifiant national (NPI/IFU) (14), Montant financier (2), Numéro de téléphone (1), Adresse IP (1)
- **Moteur complet** : Organisation (39), Adresse postale (31), Identifiant national (NPI/IFU) (14), Nom de personne (9), Montant financier (2), Numéro de téléphone (1)

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
| Règles seules | 1155 | 0,14 ms | 0,69 ms | 2,37 ms | 0,28 ms | 16,4 ms | 739 009 car./s |
| NER seul | 1155 | 68,8 ms | 227 ms | 1061 ms | 102 ms | 2139 ms | 1 993 car./s |
| Moteur sans NER | 1155 | 0,27 ms | 0,92 ms | 2,96 ms | 0,40 ms | 4,92 ms | 510 049 car./s |
| Moteur complet | 1155 | 68,6 ms | 238 ms | 1050 ms | 102 ms | 2035 ms | 2 000 car./s |

| Configuration | Court (< 200 car.) p50 / p95 | Moyen (200–1 000) p50 / p95 | Long (> 1 000) p50 / p95 |
| :--- | ---: | ---: | ---: |
| Règles seules | 0,13 / 0,49 ms (n=1092) | 0,64 / 1,14 ms (n=33) | 1,77 / 4,06 ms (n=30) |
| NER seul | 67,1 / 117 ms (n=1092) | 286 / 394 ms (n=33) | 948 / 1862 ms (n=30) |
| Moteur sans NER | 0,26 / 0,61 ms (n=1092) | 0,90 / 1,78 ms (n=33) | 2,61 / 4,28 ms (n=30) |
| Moteur complet | 67,2 / 110 ms (n=1092) | 279 / 384 ms (n=33) | 957 / 1891 ms (n=30) |

Temps mesuré autour de `detect()` en processus, après échauffement, hors réseau et hors politique côté serveur. Le chargement initial du modèle NER (2538 ms) n'est payé qu'une fois par processus.

## 7. Masquage : données encore lisibles après la passerelle

| Configuration | Masquées entièrement | Partiellement | Pas du tout |
| :--- | ---: | ---: | ---: |
| Règles seules | 52,1 % | 0,2 % | 47,7 % |
| NER seul | 40,5 % | 2,3 % | 57,2 % |
| Moteur sans NER | 52,1 % | 0,2 % | 47,7 % |
| Moteur complet | 92,4 % | 1,2 % | 6,4 % |

Détail pour **Moteur complet** :

| Type | Entités | Entièrement | Partiellement | Pas du tout |
| :--- | ---: | ---: | ---: | ---: |
| Nom de personne | 267 | 96 % | 2 % | 1 % |
| Organisation | 90 | 92 % | 3 % | 4 % |
| Adresse postale | 55 | 96 % | 2 % | 2 % |
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
| man-045 | Nom de personne | `Comlan Ahouandjinou` | … diabète de type 2. Patient : Comlan Ahouandjinou, 12/04/1968. |
| man-045 | Date de naissance | `12/04/1968` | …atient : Comlan Ahouandjinou, 12/04/1968. |
| man-046 | Donnée médicale | `AVC` | Ma collègue a eu un AVC la semaine dernière, comment … |
| man-056 | Fonction / poste | `électricien` | …e ? « Boris Amoussou, 34 ans, électricien chez BTP Mono Construction, h… |
| man-061 | Date de naissance | `1985-06-21` | …ntrôle médical, Gildas Sagbo, 1985-06-21, 2045789013, déclare une hern… |
| man-061 | Identifiant national (NPI/IFU) | `2045789013` | …al, Gildas Sagbo, 1985-06-21, 2045789013, déclare une hernie discale s… |
| man-061 | Donnée médicale | `hernie discale` | …6-21, 2045789013, déclare une hernie discale suite à un accident du travai… |
| man-063 | Fonction / poste | `chef de garage` | …ou, 32 ans de service, ancien chef de garage. Ton chaleureux. |
| gen-002 | Organisation | `Transports Alafia` | …se en demeure à l'encontre de Transports Alafia pour non-déclaration de Gisèl… |
| gen-015 | Fonction / poste | `enseignant` | …il de Mme Gisèle Gnonlonfoun, enseignant, pour un salaire brut mensuel… |
| gen-020 | Identifiant fiscal | `3744748326841` | …ciété Société Ouémé Agro, IFU 3744748326841, virement vers BJ67 BE88 0450… |
| gen-031 | Fonction / poste | `chauffeur` | …ail de Mme Yasmine Yessoufou, chauffeur, pour un salaire brut mensuel… |
| gen-036 | Fonction / poste | `électricien` | …ge Les Lauriers en qualité de électricien, NPI 0020196226. |

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
| man-064 | Organisation | `RGPD/APDP` | …léphone ? Quelles précautions RGPD/APDP ? |
| man-065 | Organisation | `LinkedIn` | Rédige un post LinkedIn pour célébrer les 55 ans de l… |
| man-065 | Organisation | `CNSS` | …our célébrer les 55 ans de la CNSS, ton institutionnel, avec tro… |
| gen-012 | Organisation | `Bénin` | …le et cotisation patronale au Bénin, avec un exemple chiffré simp… |
| gen-020 | Identifiant national (NPI/IFU) | `3744748326841` | …ciété Société Ouémé Agro, IFU 3744748326841, virement vers BJ67 BE88 0450… |

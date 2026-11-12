# Évaluation d'utilisabilité du tableau de bord

> **Statut (12/11/2026)** : non réalisée. Le projet est conduit seul et ne disposait pas des participants nécessaires. Le protocole, le kit et le script de calcul sont prêts et testés, pour un déploiement pilote.

Les tests automatisés ([dashboard.e2e.ts](../../../apps/dashboard/e2e/dashboard.e2e.ts)) vérifient que le tableau de bord **fonctionne**. Cette évaluation mesure s'il est **facile à utiliser** par les personnes qui en auront la charge. Elle demande de vrais participants : elle ne peut pas être automatisée.

## 1. Objectifs

1. Les tâches courantes du RSSI et du DPO sont-elles réalisées **sans aide** ?
2. En combien de temps, avec quelles erreurs ?
3. Quelle satisfaction perçue ? Mesurée par le questionnaire **SUS** (System Usability Scale, Brooke 1996), score de 0 à 100.

### Objectifs fixés avant les séances

Fixés **avant** toute mesure, pour qu'ils ne puissent pas être ajustés aux résultats. Tant que les séances n'ont pas eu lieu, ce sont des hypothèses, pas des résultats.

| Critère | Objectif | Justification |
| :--- | :--- | :--- |
| SUS moyen | ≥ 68 | Moyenne observée sur des centaines d'études (Bangor et al., 2009) : l'outil doit être au moins dans la moyenne |
| Réussite des tâches sans aide | ≥ 80 % en moyenne, aucune tâche < 60 % | Seuil courant pour un outil professionnel utilisé avec une courte prise en main |
| Tâches critiques (4 : accès justifié, 7 : validation d'une politique) | 100 % de réussite, avec ou sans indice | Une erreur sur ces tâches a une conséquence juridique ou de sécurité |
| Problèmes bloquants (gravité 3) | aucun problème rencontré par 2 participants ou plus | Un problème bloquant partagé doit être corrigé avant déploiement |

## 2. Participants

- **5 à 8 personnes**. Cinq participants révèlent la plupart des problèmes d'utilisabilité majeurs (Nielsen et Landauer, 1993) ; au-delà de 8, l'intervalle de confiance du SUS se resserre peu.
- Profils visés : RSSI ou adjoint, DPO ou juriste conformité, administrateur système, et au moins une personne d'une direction métier sans formation sécurité (pour mesurer la courbe d'apprentissage).
- Aucun participant ne doit avoir vu le tableau de bord avant la séance.
- Noter pour chacun : rôle, ancienneté, aisance déclarée avec les outils informatiques (1 à 5). **Aucune donnée nominative** dans les fichiers de résultats : un identifiant P1, P2… suffit.

## 3. Préparation

- Base de démonstration : `pnpm db:reset` puis `pnpm db:demo-events` (événements fictifs sur plusieurs jours), API et tableau de bord lancés (`pnpm dev`), puis `pnpm utilisabilite:preparer` : ajoute le collaborateur « parti » de la tâche 9, fait passer un vrai prompt masqué par un agent (événement sous séquestre pour la tâche 4) et affiche les bonnes réponses des tâches 2 à 4 pour l'observateur ([preparer-utilisabilite.ts](../../../tools/eval/preparer-utilisabilite.ts)).
- Fiches imprimables (cartes de tâches, fiche observateur, questionnaire SUS) : [kit-seance.md](kit-seance.md).
- Un compte RSSI et un compte DPO par participant, MFA réinitialisée : le participant l'active lui-même (tâche 1).
- Une application d'authentification (TOTP) sur un téléphone de test fourni.
- Enregistrement d'écran **avec accord écrit** (formulaire en annexe) ; à défaut, notes de l'observateur.
- Durée : 45 min par participant (5 min d'accueil, 30 min de tâches, 10 min de questionnaire et d'entretien).

## 4. Déroulement

1. Accueil, consentement. Phrase standard : *« Nous testons l'outil, pas vous. Il n'y a pas de mauvaise réponse. Pensez à voix haute : dites ce que vous cherchez, ce que vous comprenez, ce qui vous surprend. »*
2. Tâches dans l'ordre ci-dessous, une carte par tâche. L'observateur **n'aide pas**. Si le participant est bloqué plus de 3 minutes, ou le demande, la tâche est notée en échec et l'observateur montre la solution avant la tâche suivante.
3. Questionnaire SUS, rempli **immédiatement** après les tâches, sans discussion préalable.
4. Entretien libre : ce qui a plu, ce qui a gêné, ce qui manque.

## 5. Tâches

Chaque tâche a un critère de réussite observable. Temps limite : 3 minutes (tâches 4 et 6 : 5 minutes).

| N° | Rôle | Consigne lue au participant | Réussite si |
| :-- | :-- | :-- | :-- |
| 1 | RSSI | « Connectez-vous avec le compte fourni et activez le second facteur. » | Arrive sur la vue d'ensemble avec la MFA activée |
| 2 | RSSI | « Combien de demandes ont été bloquées cette semaine, et quelle direction en a le plus ? » | Donne les deux réponses justes (vue d'ensemble, période 7 jours) |
| 3 | RSSI | « Retrouvez le dernier blocage lié à une clé d'API et dites quel service d'IA était visé. » | Ouvre le bon événement dans le journal et lit le service |
| 4 | DPO | « Une réquisition judiciaire demande le contenu de cet événement. Consultez-le en respectant la procédure. » | Saisit une justification et accède au détail ; la consultation apparaît au journal |
| 5 | RSSI | « Testez si ce texte serait bloqué : *Mon IBAN est FR76 3000 6000 0112 3456 7890 189.* Pourquoi ? » | Utilise l'inspection et explique la décision à partir du score |
| 6 | RSSI | « Interdisez l'envoi de numéros de sécurité sociale vers les services d'IA non approuvés. » | Crée la règle ; elle passe en attente de validation |
| 7 | DPO | « Une modification de politique attend votre validation. Examinez-la et décidez. » (la modification est celle créée à la tâche 6 ; si la tâche 6 a échoué, l'observateur la crée avant la tâche 7) | Trouve le changement en attente et l'approuve ou le rejette en connaissance de cause |
| 8 | RSSI | « Un nouvel agent doit être installé sur le poste de Marie Agbodji. Préparez son enrôlement. » | Génère un code d'enrôlement pour la bonne personne et copie la commande |
| 9 | RSSI | « Rodrigue Hounkpè a quitté la CNSS. Retirez-lui l'accès. » | Désactive le bon utilisateur, après confirmation |

Pour chaque tâche, l'observateur note dans [taches.csv](taches.csv) : réussite (1 = sans aide, 0,5 = avec un indice, 0 = échec), temps en secondes, nombre d'erreurs (clic sur une mauvaise page, retour arrière, saisie erronée), et une remarque.

## 6. Questionnaire SUS

Réponse de 1 (pas du tout d'accord) à 5 (tout à fait d'accord), à remplir dans [reponses-sus.csv](reponses-sus.csv). Formulation française usuelle :

1. Je pense que j'aimerais utiliser ce tableau de bord fréquemment.
2. J'ai trouvé ce tableau de bord inutilement complexe.
3. J'ai trouvé ce tableau de bord facile à utiliser.
4. Je pense que j'aurais besoin de l'aide d'une personne technique pour pouvoir l'utiliser.
5. J'ai trouvé que les différentes fonctions étaient bien intégrées.
6. J'ai trouvé qu'il y avait trop d'incohérences dans ce tableau de bord.
7. J'imagine que la plupart des gens apprendraient très rapidement à l'utiliser.
8. J'ai trouvé ce tableau de bord très lourd à utiliser.
9. Je me suis senti(e) très en confiance en l'utilisant.
10. J'ai eu besoin d'apprendre beaucoup de choses avant de pouvoir l'utiliser.

**Score** : items impairs → réponse − 1 ; items pairs → 5 − réponse ; somme × 2,5. Le calcul est fait par `pnpm eval:utilisabilite`.

**Lecture** (Bangor, Kortum et Miller, 2009) : 68 est la moyenne observée sur des centaines d'études ; < 51 médiocre ; 68–80 bon ; > 80 excellent.

## 7. Analyse

`pnpm eval:utilisabilite` lit les deux fichiers CSV et écrit [utilisabilite.md](../resultats/utilisabilite.md) :
- SUS : score par participant, moyenne, écart-type, intervalle de confiance à 95 % (loi de Student) ;
- par tâche : taux de réussite, temps médian, erreurs moyennes ;
- par rôle : SUS moyen.

Les remarques des entretiens sont regroupées à la main par thème. Chaque problème est classé par gravité (1 cosmétique, 2 gêne, 3 bloquant), avec le nombre de participants concernés.

## 8. Limites à mentionner

- Échantillon réduit : le SUS sur 5 à 8 personnes a un intervalle de confiance large (souvent ± 10 points).
- Données de démonstration, pas de vraies alertes : la pression d'un incident réel n'est pas reproduite.
- Les participants savent qu'ils sont observés (effet Hawthorne) : leur satisfaction déclarée est souvent surestimée.

## Annexe : formulaire de consentement (modèle)

> Je soussigné(e) accepte de participer à l'évaluation du tableau de bord AI Compliance Gateway. J'ai été informé(e) que la séance dure environ 45 minutes, que mon écran et ma voix peuvent être enregistrés, que les enregistrements ne serviront qu'à cette évaluation et seront détruits à la fin du projet, et que les résultats seront publiés de façon anonyme. Je peux arrêter à tout moment sans justification.
>
> J'accepte l'enregistrement : ☐ oui ☐ non — Date : ……… Signature : ………

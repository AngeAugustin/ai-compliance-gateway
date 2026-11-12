# Kit de séance — utilisabilité du tableau de bord

À imprimer : une fiche observateur et un questionnaire SUS par participant, et un jeu de cartes de tâches. Protocole complet : [protocole.md](protocole.md).

## 1. Avant chaque participant (10 min)

```bash
pnpm db:reset
pnpm db:demo-events
pnpm dev
```

Puis, l'API lancée, dans un autre terminal :

```bash
pnpm utilisabilite:preparer
```

Ce script :
- ajoute le collaborateur « parti » de la tâche 9 ;
- fait passer un vrai prompt masqué par un agent, pour que la tâche 4 ait un événement sous séquestre ;
- affiche la **fiche réponses** (bonnes réponses des tâches 2 et 3, événement à désigner pour la tâche 4). Recopiez-la sur la fiche observateur, sans la montrer.

Vérifier aussi :
- [ ] téléphone de test avec une application d'authentification (TOTP), sans ancien compte ACG ;
- [ ] navigateur en navigation privée, sur la page de connexion du tableau de bord ;
- [ ] consentement signé (annexe du protocole) ;
- [ ] chronomètre.

## 2. Cartes de tâches (à découper, une par tâche, remises dans l'ordre)

> **Tâche 1** — Connectez-vous avec le compte fourni et activez le second facteur.

> **Tâche 2** — Combien de demandes ont été bloquées cette semaine, et quelle direction en a le plus ?

> **Tâche 3** — Retrouvez le dernier blocage lié à une clé d'API et dites quel service d'IA était visé.

> **Tâche 4** (compte DPO) — Une réquisition judiciaire demande le contenu de cet événement *(l'observateur le désigne)*. Consultez-le en respectant la procédure.

> **Tâche 5** — Testez si ce texte serait bloqué : *Mon IBAN est FR76 3000 6000 0112 3456 7890 189.* Pourquoi ?

> **Tâche 6** — Interdisez l'envoi de numéros de sécurité sociale vers les services d'IA non approuvés.

*Si la tâche 6 a échoué, l'observateur crée lui-même la règle (compte RSSI) avant de passer à la tâche 7.*

> **Tâche 7** (compte DPO) — Une modification de politique attend votre validation. Examinez-la et décidez.

> **Tâche 8** — Un nouvel agent doit être installé sur le poste de Marie Agbodji. Préparez son enrôlement.

> **Tâche 9** — Rodrigue Hounkpè a quitté la CNSS. Retirez-lui l'accès.

## 3. Fiche observateur

Participant : **P__** · Rôle : ________ · Ancienneté : ____ · Aisance informatique (1 à 5) : __ · Date : ________

Réponses attendues (sortie de `pnpm utilisabilite:preparer`) : T2 ________ / ________ · T3 ________ · T4 ________

| Tâche | Réussite (1 / 0,5 / 0) | Temps (s) | Erreurs | Remarque (ce qui a bloqué, ce qui a été dit) |
| :-: | :-: | :-: | :-: | :-- |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |
| 8 | | | | |
| 9 | | | | |

- **Réussite** : 1 = sans aide ; 0,5 = avec un indice ; 0 = échec (bloqué plus de 3 min, 5 min pour les tâches 4 et 6, ou abandon).
- **Erreur** : clic sur une mauvaise page, retour arrière, saisie erronée.
- Ne pas aider. Si le participant est bloqué, noter l'échec, montrer la solution, passer à la suite.

Problèmes observés (gravité 1 cosmétique, 2 gêne, 3 bloquant) :

| Problème | Gravité |
| :-- | :-: |
| | |
| | |

## 4. Questionnaire SUS (rempli par le participant, juste après les tâches)

Entourez de 1 (pas du tout d'accord) à 5 (tout à fait d'accord).

| N° | Affirmation | 1 | 2 | 3 | 4 | 5 |
| :-: | :-- | :-: | :-: | :-: | :-: | :-: |
| 1 | Je pense que j'aimerais utiliser ce tableau de bord fréquemment. | ○ | ○ | ○ | ○ | ○ |
| 2 | J'ai trouvé ce tableau de bord inutilement complexe. | ○ | ○ | ○ | ○ | ○ |
| 3 | J'ai trouvé ce tableau de bord facile à utiliser. | ○ | ○ | ○ | ○ | ○ |
| 4 | Je pense que j'aurais besoin de l'aide d'une personne technique pour pouvoir l'utiliser. | ○ | ○ | ○ | ○ | ○ |
| 5 | J'ai trouvé que les différentes fonctions étaient bien intégrées. | ○ | ○ | ○ | ○ | ○ |
| 6 | J'ai trouvé qu'il y avait trop d'incohérences dans ce tableau de bord. | ○ | ○ | ○ | ○ | ○ |
| 7 | J'imagine que la plupart des gens apprendraient très rapidement à l'utiliser. | ○ | ○ | ○ | ○ | ○ |
| 8 | J'ai trouvé ce tableau de bord très lourd à utiliser. | ○ | ○ | ○ | ○ | ○ |
| 9 | Je me suis senti(e) très en confiance en l'utilisant. | ○ | ○ | ○ | ○ | ○ |
| 10 | J'ai eu besoin d'apprendre beaucoup de choses avant de pouvoir l'utiliser. | ○ | ○ | ○ | ○ | ○ |

## 5. Après la séance : saisie

Une ligne par participant dans [reponses-sus.csv](reponses-sus.csv), une ligne par tâche et par participant dans [taches.csv](taches.csv) :

```
participant,role,q1,q2,q3,q4,q5,q6,q7,q8,q9,q10
P1,RSSI,4,2,4,1,4,2,4,2,4,2
```

```
participant,role,tache,reussite,temps_s,erreurs,remarque
P1,RSSI,1,1,95,0,
P1,RSSI,2,0.5,140,2,a cherché dans le journal avant la vue d'ensemble
```

(Les deux lignes ci-dessus montrent le format, ce ne sont pas des résultats.) Puis `pnpm eval:utilisabilite`.

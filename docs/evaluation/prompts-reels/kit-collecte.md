# Kit de collecte — prompts réels anonymisés

Documents à utiliser dans l'ordre. Protocole complet : [protocole.md](protocole.md).

## 1. Note d'autorisation du DPO (à faire signer avant toute collecte)

> **Objet** : collecte de demandes adressées à des services d'IA, pour l'évaluation du dispositif AI Compliance Gateway.
>
> **Finalité** : mesurer la détection des données sensibles sur des formulations réelles d'agents de la CNSS. Aucune autre utilisation.
>
> **Données** : textes de demandes rédigées par des agents volontaires. Les valeurs personnelles (noms, numéros, montants, pathologies…) sont remplacées par des valeurs fictives **avant** toute annotation et toute sortie du poste de collecte.
>
> **Personnes habilitées** : le collecteur ________ et les deux annotateurs ________, ________.
>
> **Support** : poste ________, chiffré, sans connexion à un service d'IA. Les textes originaux sont détruits dès la pseudonymisation vérifiée par une seconde personne.
>
> **Conservation** : fichier pseudonymisé jusqu'au ________ (fin du projet), puis suppression.
>
> **Base** : loi n° 2017-20 portant Code du numérique en République du Bénin, livre V ; RGPD si des résidents européens sont concernés.
>
> Avis du DPO : ☐ favorable ☐ favorable avec réserves : ________ ☐ défavorable
>
> Date : ________ Signature : ________

## 2. Notice remise aux volontaires

> Dans le cadre de l'évaluation d'un outil de protection des données, nous recueillons des exemples de demandes que vous avez faites, ou voulu faire, à un service d'IA (ChatGPT, Copilot…) dans votre travail.
>
> - Votre participation est volontaire ; vous pouvez retirer vos textes jusqu'à leur pseudonymisation.
> - Écrivez la demande **telle que vous l'auriez formulée**, avec ses abréviations et ses fautes éventuelles.
> - Toutes les valeurs personnelles seront remplacées par des valeurs fictives avant analyse. Votre nom n'est jamais associé à vos textes.
> - Les textes d'origine sont détruits après remplacement.
>
> Merci d'indiquer pour chaque demande votre direction (Prestations, Cotisations, Finance, Informatique, RH, Juridique…).

## 3. Fiche de pseudonymisation (une ligne par prompt, conservée sur le poste de collecte)

| N° | Direction | Valeurs remplacées (type → nombre) | Remplacé par | Vérifié par (2ᵉ personne) | Original détruit le |
| :-- | :-- | :-- | :-- | :-- | :-- |
| reel-001 | | | | | |

Règles de remplacement, rappel du protocole :
- **même forme** : un numéro d'assuré fictif au même format, un nom fictif de même origine, un montant du même ordre ;
- **reproduire les irrégularités** : fautes, espaces, majuscules, format inhabituel ;
- jamais la passerelle elle-même pour pseudonymiser.

## 4. Fichier final

Après pseudonymisation et annotation, `docs/evaluation/prompts-reels/corpus-annote.txt` :

```
### reel-001 Finance
Fais le virement de [[FINANCIAL_AMOUNT|350 000]] FCFA à [[PERSON|Afi Kpodo]] sur [[MOBILE_MONEY|01 96 45 22 10]].

### reel-002 Technique
Pourquoi mon script plante avec ce message : connection refused ?
```

- La catégorie après l'identifiant est facultative (Finance, Technique, RH…).
- Types et conventions : [guide-annotation.md](../annotation/guide-annotation.md).
- Viser 150 à 200 prompts, dont au moins 20 % sans aucune donnée sensible.

Puis :

```bash
pnpm eval:prompts-reels
```

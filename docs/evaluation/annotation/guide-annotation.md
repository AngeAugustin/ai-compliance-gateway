# Guide d'annotation — second annotateur

Le corpus manuel (65 prompts) a été annoté par une seule personne. Un second annotateur, **indépendant**, l'annote à nouveau. On mesure ensuite l'accord entre les deux. Un accord élevé montre que les annotations ne reflètent pas seulement les choix d'une personne.

## Consignes

1. Ouvrez [a-annoter.txt](a-annoter.txt) (produit par `pnpm eval:accord export`) et enregistrez-en une copie sous **`annotations-2.txt`**, dans ce dossier.
2. N'ouvrez **ni** `data/eval/corpus-manuel.ts` **ni** les résultats de détection avant d'avoir fini : ils contiennent l'annotation de référence.
3. Entourez chaque donnée sensible d'une balise `[[TYPE|valeur]]`. Exemple :
   `Envoie [[FINANCIAL_AMOUNT|80 000]] FCFA via MoMo [[MOBILE_MONEY|01 97 12 34 56]] à l'assuré.`
4. **Ne modifiez pas le texte**, même s'il contient une faute : ajoutez seulement des balises. Le script refuse un prompt dont le texte a changé.
5. Ne touchez pas aux lignes `### man-…`.
6. Un prompt sans donnée sensible reste tel quel.
7. Durée estimée : 1 h 30. Notez à part les cas où vous avez hésité : ils sont utiles pour l'arbitrage.

## Types

| Type | Ce qu'on annote |
| :--- | :--- |
| PERSON | Prénom et nom d'une personne, tels qu'écrits, **sans** civilité (« M. ») |
| EMAIL | Adresse e-mail |
| PHONE | Numéro de téléphone (hors numéro mobile money cité comme moyen de paiement) |
| DATE_OF_BIRTH | Date de naissance d'une personne |
| ADDRESS | Lieu de résidence ou adresse d'une **personne** (pas le siège d'une direction) |
| NATIONAL_ID | Identifiant national (NPI, IFU d'une personne) |
| JOB_TITLE | Fonction d'une personne **précise** (pas un poste à pourvoir) |
| ORGANIZATION | Employeur ou société nommée, **jamais** la CNSS elle-même |
| CNSS_INSURED_NUMBER | Numéro d'assuré CNSS |
| CNSS_EMPLOYER_NUMBER | Numéro employeur CNSS |
| SALARY | Salaire ou montant de cotisation |
| MEDICAL | La pathologie ou l'information de santé, pas le mot « diagnostic » |
| IBAN | IBAN |
| BANK_ACCOUNT | Numéro de compte bancaire (hors IBAN) |
| CREDIT_CARD | Numéro de carte bancaire |
| MOBILE_MONEY | Numéro mobile money (MoMo, Moov Money…) |
| FINANCIAL_AMOUNT | Tout autre montant |
| TAX_ID | Identifiant fiscal d'une entreprise |
| API_KEY | Clé ou jeton d'API (sk-…, ghp_…, AKIA…, JWT) |
| PASSWORD | Mot de passe (la valeur seule) |
| PRIVATE_KEY | Clé privée, des lignes `-----BEGIN` à `-----END` incluses |
| IP_ADDRESS | Adresse IP |
| INTERNAL_URL | URL d'un système interne |
| INTERNAL_ID | Identifiant interne (dossier, ticket, matricule) |
| CONNECTION_STRING | Chaîne de connexion à une base ou un service (postgresql://…, redis://…) |

## Conventions

- On annote **la valeur seule**, sans libellé ni unité : « 350 000 », pas « 350 000 FCFA » ; « Lagune#2025 », pas « mot de passe : Lagune#2025 ».
- Une valeur contenue dans une autre n'est annotée qu'une fois, avec le type le plus englobant : le mot de passe d'une chaîne de connexion fait partie de la chaîne.
- Dans le doute entre deux types, choisissez celui qui décrit le **rôle** de la donnée dans la phrase, et notez l'hésitation.

## Après l'annotation

```bash
pnpm eval:accord
```

Le script écrit [accord-annotateurs.md](../resultats/accord-annotateurs.md) : F1 strict, F1 protection, kappa de Cohen par caractère, accord par type et liste des désaccords. Les désaccords sont arbitrés à deux. Si une convention change, elle est ajoutée à ce guide et appliquée à tout le corpus.

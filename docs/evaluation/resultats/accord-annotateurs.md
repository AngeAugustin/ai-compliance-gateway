# Accord entre annotateurs — corpus manuel

Date : 2026-11-12 · 65 prompts · annotateur 1 (référence du corpus) : 97 entités ; annotateur 2 (analyste programmeur de la DSI, connaissant le métier) : 85 entités. Guide : [guide-annotation.md](../annotation/guide-annotation.md).

| Mesure | Accord |
| :--- | ---: |
| F1 strict (type et bornes identiques) | 71,4 % |
| F1 chevauchement typé | 79,1 % |
| F1 protection (chevauchement, tout type) | 90,1 % |
| Kappa de Cohen par caractère | 0,836 (presque parfait) |

## Par type (chevauchement typé, du moins au plus consensuel)

| Type | Annotateur 1 | Annotateur 2 | F1 |
| :--- | ---: | ---: | ---: |
| IBAN | 3 | 0 | 0,0 % |
| BANK_ACCOUNT | 0 | 3 | 0,0 % |
| JOB_TITLE | 7 | 0 | 0,0 % |
| SALARY | 3 | 0 | 0,0 % |
| CONNECTION_STRING | 2 | 0 | 0,0 % |
| MOBILE_MONEY | 3 | 1 | 50,0 % |
| INTERNAL_ID | 2 | 2 | 50,0 % |
| IP_ADDRESS | 1 | 3 | 50,0 % |
| PASSWORD | 1 | 2 | 66,7 % |
| PHONE | 3 | 5 | 75,0 % |
| ORGANIZATION | 6 | 4 | 80,0 % |
| FINANCIAL_AMOUNT | 7 | 10 | 82,4 % |
| MEDICAL | 6 | 6 | 83,3 % |
| ADDRESS | 4 | 3 | 85,7 % |
| PERSON | 26 | 23 | 93,9 % |
| EMAIL | 5 | 5 | 100,0 % |
| API_KEY | 4 | 4 | 100,0 % |
| CNSS_INSURED_NUMBER | 3 | 3 | 100,0 % |
| DATE_OF_BIRTH | 3 | 3 | 100,0 % |
| NATIONAL_ID | 2 | 2 | 100,0 % |
| CREDIT_CARD | 2 | 2 | 100,0 % |
| CNSS_EMPLOYER_NUMBER | 1 | 1 | 100,0 % |
| TAX_ID | 1 | 1 | 100,0 % |
| INTERNAL_URL | 1 | 1 | 100,0 % |
| PRIVATE_KEY | 1 | 1 | 100,0 % |

## Désaccords (34)

- man-001 : « FR76 3000 6000 0112 3456 7890 189 » IBAN / BANK_ACCOUNT
- man-002 : « 01 97 12 34 56 » MOBILE_MONEY / PHONE
- man-007 : JOB_TITLE « magasinier » — absent chez l'annotateur 2
- man-007 : « 185 000 » SALARY / FINANCIAL_AMOUNT
- man-007 : « 15 000 » SALARY / FINANCIAL_AMOUNT
- man-008 : JOB_TITLE « chauffeur » — absent chez l'annotateur 2
- man-011 : bornes « Grâce Dossou » / « Mme Grâce Dossou »
- man-011 : JOB_TITLE « secrétaire de direction » — absent chez l'annotateur 2
- man-013 : bornes « Codjo Sossa » / « M. Codjo Sossa »
- man-014 : PERSON « Hermann Lokossou » — absent chez l'annotateur 2
- man-014 : JOB_TITLE « contrôleur de gestion » — absent chez l'annotateur 2
- man-015 : « FR1420041010050500013M02606 » IBAN / BANK_ACCOUNT
- man-018 : « 3 456 780 » SALARY / FINANCIAL_AMOUNT
- man-019 : ORGANIZATION « Boulangerie La Lagune » — absent chez l'annotateur 2
- man-023 : bornes « 15000 » / « 15000F »
- man-023 : « +229 01 51 22 33 44 » MOBILE_MONEY / PHONE
- man-024 : bornes « 275 000 » / « 275 000 € »
- man-026 : ORGANIZATION « Groupe Atlantique Services » — absent chez l'annotateur 2
- man-026 : bornes « Clarisse Tchibozo » / « Me Clarisse Tchibozo »
- man-028 : bornes « Hortense Assogba » / « Mme Hortense Assogba »
- man-031 : « postgresql://prestations:Lagune#2025@10.20.4.17:5432/prod » CONNECTION_STRING / PASSWORD
- man-031 : « redis://10.20.4.18:6379 » CONNECTION_STRING / IP_ADDRESS
- man-040 : INTERNAL_ID « SUP-20260142 » — absent chez l'annotateur 2
- man-041 : JOB_TITLE « aide-soignante » — absent chez l'annotateur 2
- man-044 : bornes « Ange Houénou » / « M. Ange Houénou »
- man-045 : MEDICAL « metformine 850 mg matin et soir » — ajouté par l'annotateur 2
- man-046 : MEDICAL « AVC » — absent chez l'annotateur 2
- man-049 : PERSON « Victoire Hounsou » — absent chez l'annotateur 2
- man-052 : PERSON « Pascal » — absent chez l'annotateur 2
- man-055 : « BJ59BJ0610100100144039000769 » IBAN / BANK_ACCOUNT
- man-056 : JOB_TITLE « électricien » — absent chez l'annotateur 2
- man-060 : INTERNAL_ID « 4111 2233 » — ajouté par l'annotateur 2
- man-063 : JOB_TITLE « chef de garage » — absent chez l'annotateur 2
- man-064 : ADDRESS « Malanville » — absent chez l'annotateur 2

## Lecture

- Le F1 protection est l'accord qui compte pour la sécurité : ce que l'un ou l'autre masquerait. Un désaccord de type seul (SALARY / FINANCIAL_AMOUNT) ne change pas la protection.
- Kappa (Landis et Koch, 1977) : < 0,4 passable, 0,4–0,6 modéré, 0,6–0,8 substantiel, > 0,8 presque parfait.
- Les désaccords sont à arbitrer à deux ; une convention ajoutée au guide doit ensuite être appliquée à tout le corpus.

## Correspondance des types (--correspondance)

Le second annotateur a employé ses propres noms de types. Ils ont été ramenés à ceux du guide par une table fixe ([accord-annotateurs.ts](../../../tools/eval/accord-annotateurs.ts), `TYPE_SYNONYMS`) ; le fichier d'origine n'est pas modifié. Le F1 protection ne dépend pas des types ; le F1 strict et le kappa en dépendent.

| Type de l'annotateur | Type du guide | Occurrences |
| :--- | :--- | ---: |
| PHONE_NUMBER | PHONE | 5 |
| PERSON_NAME | PERSON | 23 |
| INSURED_ID | CNSS_INSURED_NUMBER | 3 |
| PAYMENT_CARD | CREDIT_CARD | 2 |
| EMPLOYER_ID | CNSS_EMPLOYER_NUMBER | 1 |
| CASE_ID | INTERNAL_ID | 1 |
| DATABASE_CREDENTIAL | PASSWORD | 1 |
| AWS_ACCESS_KEY | API_KEY | 1 |
| ACCESS_TOKEN | API_KEY | 2 |
| HEALTH_INFORMATION | MEDICAL | 5 |
| MEDICAL_INFORMATION | MEDICAL | 1 |
| AGE | (hors guide, balise retirée) | 1 |
| ORDER_REFERENCE | INTERNAL_ID | 1 |

import type { AnnotatedSource } from "../../tools/eval/annotation.js";

/**
 * Corpus annoté à la main — prompts rédigés comme de vraies demandes d'agents CNSS,
 * indépendamment des motifs du moteur (formulations libres, fautes, cas limites,
 * négatifs difficiles). Toutes les données sont fictives.
 *
 * Convention d'annotation (voir docs/evaluation/protocole-detection.md) :
 * - on annote la valeur seule, sans libellé ni unité (« 350 000 », pas « 350 000 FCFA ») ;
 * - PERSON : prénom + nom tels qu'écrits, sans civilité ;
 * - ADDRESS : lieu de résidence ou adresse d'une personne (pas le siège d'une direction) ;
 * - JOB_TITLE : fonction d'une personne précise (pas un poste à pourvoir) ;
 * - ORGANIZATION : employeur ou société nommée, jamais la CNSS elle-même ;
 * - MEDICAL : la pathologie ou l'information de santé, pas le mot « diagnostic » ;
 * - SALARY : salaire ou montant de cotisation ; FINANCIAL_AMOUNT : autre montant.
 */
export const CORPUS_MANUEL: AnnotatedSource[] = [
  // —— Reprise corrigée des 5 prompts historiques ——
  {
    id: "man-001",
    context: "Finance",
    markup: "Rédige un virement de ⟦FINANCIAL_AMOUNT|2 500 000⟧ FCFA vers ⟦IBAN|FR76 3000 6000 0112 3456 7890 189⟧ pour les cotisations.",
  },
  {
    id: "man-002",
    context: "Finance",
    markup: "Envoie ⟦FINANCIAL_AMOUNT|80 000⟧ FCFA via MoMo ⟦MOBILE_MONEY|01 97 12 34 56⟧ à l'assuré.",
  },
  {
    id: "man-003",
    context: "RH",
    markup: "Voici le CV de ⟦PERSON|Jean Dupont⟧, ⟦EMAIL|jean.dupont@cnss.bj⟧, candidat au poste d'analyste.",
    note: "Le gold historique n'attendait que EMAIL ; le nom est une donnée personnelle.",
  },
  {
    id: "man-004",
    context: "Technique",
    markup: "Ma clé OpenAI ⟦API_KEY|sk-abcdefghijklmnopqrstuvwxyz012345⟧ ne doit pas fuiter.",
  },
  {
    id: "man-005",
    context: "Finance",
    markup: "Le n° assuré CNSS ⟦CNSS_INSURED_NUMBER|A12345678⟧ a un impayé de cotisation.",
  },

  // —— RH ——
  {
    id: "man-006",
    context: "RH",
    markup:
      "Bonjour, peux-tu m'aider à écrire un mail pour annoncer à ⟦PERSON|Rosine Akakpo⟧ qu'elle n'a pas été retenue ? Elle avait postulé comme assistante comptable, son numéro c'est le ⟦PHONE|01 66 45 21 08⟧.",
  },
  {
    id: "man-007",
    context: "RH",
    markup:
      "Fiche de paie de ⟦PERSON|KOSSI HOUNKANRIN⟧ — ⟦JOB_TITLE|magasinier⟧ — salaire de base ⟦SALARY|185 000⟧ F, prime de transport ⟦SALARY|15 000⟧ F. Vérifie le calcul de l'ITS.",
    note: "Nom en majuscules ; la prime fait partie de la rémunération (SALARY).",
  },
  {
    id: "man-008",
    context: "RH",
    markup:
      "rédige un avertissement pour retards répétés à l'attention de ⟦PERSON|mathias zinsou⟧ (⟦JOB_TITLE|chauffeur⟧), sans être trop dur stp",
    note: "Nom en minuscules, sans ponctuation.",
  },
  {
    id: "man-009",
    context: "RH",
    markup:
      "Liste des agents à former : ⟦PERSON|Aïcha Yessoufou⟧, ⟦PERSON|Romuald Gbaguidi⟧ et ⟦PERSON|Sidonie Tossou⟧. Prévoir le déjeuner pour 3 personnes.",
  },
  {
    id: "man-010",
    context: "RH",
    markup:
      "Quels sont les droits d'un salarié en période d'essai au Bénin ? Durée maximale, rupture, préavis.",
  },
  {
    id: "man-011",
    context: "RH",
    markup:
      "Merci de reformuler : « Suite à notre entretien du 12 mars, nous confirmons l'embauche de Mme ⟦PERSON|Grâce Dossou⟧, née le ⟦DATE_OF_BIRTH|7 juillet 1994⟧, domiciliée à ⟦ADDRESS|Fidjrossè⟧, en qualité de ⟦JOB_TITLE|secrétaire de direction⟧. »",
  },
  {
    id: "man-012",
    context: "RH",
    markup:
      "Fais un tableau Excel avec les colonnes nom, matricule, date d'entrée, service. Pas besoin de données, juste la structure.",
  },
  {
    id: "man-013",
    context: "RH",
    markup:
      "Pour le dossier retraite de M. ⟦PERSON|Codjo Sossa⟧ (NPI ⟦NATIONAL_ID|1093456728⟧), il manque l'attestation de l'ancien employeur ⟦ORGANIZATION|Imprimerie du Zou⟧. Rédige la relance.",
  },
  {
    id: "man-014",
    context: "RH",
    markup:
      "Can you translate into English: « ⟦PERSON|Hermann Lokossou⟧ a été promu ⟦JOB_TITLE|contrôleur de gestion⟧ à compter du 1er janvier. »",
  },

  // —— Finance ——
  {
    id: "man-015",
    context: "Finance",
    markup:
      "IBAN du bénéficiaire : ⟦IBAN|FR1420041010050500013M02606⟧ — merci de vérifier le format avant l'envoi à la banque.",
  },
  {
    id: "man-016",
    context: "Finance",
    markup:
      "Le client a payé avec sa carte ⟦CREDIT_CARD|4111 1111 1111 1111⟧ mais le paiement est refusé. Rédige une réponse polie.",
  },
  {
    id: "man-017",
    context: "Finance",
    markup:
      "Rembourse ⟦FINANCIAL_AMOUNT|42 500⟧ FCFA sur le Moov Money ⟦MOBILE_MONEY|0195873412⟧ de ⟦PERSON|Félicité Agbo⟧ et prépare le SMS de confirmation.",
  },
  {
    id: "man-018",
    context: "Finance",
    markup:
      "Total des cotisations du trimestre : ⟦SALARY|3 456 780⟧ FCFA pour 27 salariés. Fais-moi un graphique de l'évolution sur l'année.",
  },
  {
    id: "man-019",
    context: "Finance",
    markup:
      "Prépare un échéancier pour l'employeur ⟦ORGANIZATION|Boulangerie La Lagune⟧, dette de ⟦FINANCIAL_AMOUNT|1.250.000⟧ FCFA, en 6 mensualités.",
    note: "Montant avec points comme séparateurs.",
  },
  {
    id: "man-020",
    context: "Finance",
    markup:
      "Explique le calcul du taux de cotisation pour les prestations familiales : base plafonnée, part patronale, exemples pour 100 000 et 500 000 FCFA.",
    note: "Montants d'exemple, pas des données : négatif difficile.",
  },
  {
    id: "man-021",
    context: "Finance",
    markup:
      "Le n° employeur ⟦CNSS_EMPLOYER_NUMBER|45102938⟧ correspond à quelle société ? Je veux vérifier avant de lancer le recouvrement.",
  },
  {
    id: "man-022",
    context: "Finance",
    markup:
      "Société ⟦ORGANIZATION|Transports Alafia⟧, IFU ⟦TAX_ID|3201912345678⟧ : rédige l'attestation de régularité de cotisations.",
    note: "IFU d'entreprise annoté TAX_ID.",
  },
  {
    id: "man-023",
    context: "Finance",
    markup:
      "envoie ⟦FINANCIAL_AMOUNT|15000⟧F a ⟦MOBILE_MONEY|+229 01 51 22 33 44⟧ sur MTN momo c'est pour le remboursement des frais de mission",
    note: "Montant collé à « F », sans accents ni ponctuation.",
  },
  {
    id: "man-024",
    context: "Finance",
    markup: "Le virement de ⟦FINANCIAL_AMOUNT|275 000⟧ € a été reçu le 3 octobre, merci de le lettrer.",
  },
  {
    id: "man-025",
    context: "Finance",
    markup:
      "Compare les budgets 2025 et 2026 de la direction des prestations : +4,5 % en fonctionnement, −2 % en investissement. Fais une synthèse.",
  },

  // —— Juridique ——
  {
    id: "man-026",
    context: "Juridique",
    markup:
      "Rédige les conclusions dans l'affaire opposant la CNSS à ⟦ORGANIZATION|Groupe Atlantique Services⟧ devant le tribunal de commerce de Cotonou. Notre avocat est Me ⟦PERSON|Clarisse Tchibozo⟧.",
    note: "« Cotonou » désigne ici la juridiction : non annoté.",
  },
  {
    id: "man-027",
    context: "Juridique",
    markup:
      "Quelles obligations impose la loi 2017-20 portant code du numérique sur le transfert de données vers un prestataire hors du Bénin ?",
  },
  {
    id: "man-028",
    context: "Juridique",
    markup:
      "Mme ⟦PERSON|Hortense Assogba⟧ conteste le refus de sa pension de réversion (dossier ⟦INTERNAL_ID|REC-20250318⟧). Elle est la veuve de feu ⟦PERSON|Euloge Assogba⟧. Analyse ses chances de succès.",
  },
  {
    id: "man-029",
    context: "Juridique",
    markup:
      "Rédige une clause de confidentialité pour le contrat de prestation informatique, conforme aux recommandations de l'APDP.",
  },
  {
    id: "man-030",
    context: "Juridique",
    markup:
      "Litige : ⟦PERSON|Abdou Chabi⟧, assuré n° ⟦CNSS_INSURED_NUMBER|B20481736⟧, réclame les arriérés de sa rente d'accident du travail depuis 2023.",
  },

  // —— Technique ——
  {
    id: "man-031",
    context: "Technique",
    markup:
      "mon .env :\nDATABASE_URL=⟦CONNECTION_STRING|postgresql://prestations:Lagune#2025@10.20.4.17:5432/prod⟧\nREDIS_URL=⟦CONNECTION_STRING|redis://10.20.4.18:6379⟧\npourquoi Prisma ne se connecte pas ?",
  },
  {
    id: "man-032",
    context: "Technique",
    markup:
      "Voici ma config AWS : aws_access_key_id = ⟦API_KEY|AKIAQ3EGRT7HXZPL4KDM⟧ — comment je la mets dans GitHub Actions ?",
  },
  {
    id: "man-033",
    context: "Technique",
    markup:
      "Le serveur ⟦IP_ADDRESS|192.168.10.45⟧ ne répond plus depuis ce matin, ping OK mais port 443 fermé. Diagnostic ?",
    note: "« Diagnostic » au sens technique : ne doit pas déclencher MEDICAL.",
  },
  {
    id: "man-034",
    context: "Technique",
    markup:
      "Explique-moi la différence entre une adresse IPv4 et IPv6 avec des exemples comme 8.8.8.8.",
    note: "IP publique d'exemple (DNS Google) : négatif difficile.",
  },
  {
    id: "man-035",
    context: "Technique",
    markup:
      "Erreur sur ⟦INTERNAL_URL|http://gesprest.cnss.bj:8080/api/assures/recherche⟧ : 500 Internal Server Error. Stacktrace ci-dessous… NullPointerException at AssureService.java:142",
  },
  {
    id: "man-036",
    context: "Technique",
    markup:
      "j'ai oublié mon mdp: ⟦PASSWORD|Soleil2024!⟧ c'est pour le compte admin du serveur de fichiers, comment le réinitialiser ?",
  },
  {
    id: "man-037",
    context: "Technique",
    markup:
      "Écris une fonction JavaScript qui valide un IBAN avec le contrôle modulo 97 et des tests unitaires.",
  },
  {
    id: "man-038",
    context: "Technique",
    markup:
      "Pourquoi ce token GitHub ⟦API_KEY|ghp_8xK2mQ9vL4nR7tY1wZ3pA6sD0fG5hJ8kL2qW⟧ est-il refusé par l'API ?",
  },
  {
    id: "man-039",
    context: "Technique",
    markup:
      "Voici la clé privée du serveur, aide-moi à configurer nginx :\n⟦PRIVATE_KEY|-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA7vQ3mZ8xK2LpR9tYwN4cB6dF1gH3jK5mN7pQ9rS2tU4vW6xY\n8zA1bC3dE5fG7hI9jK1lM3nO5pQ7rS9tU1vW3xY5zA7bC9dE1fG3hI5jK7lM9nO\n-----END RSA PRIVATE KEY-----⟧",
  },
  {
    id: "man-040",
    context: "Technique",
    markup:
      "Ticket ⟦INTERNAL_ID|SUP-20260142⟧ : l'utilisateur ⟦EMAIL|r.gbaguidi@cnss.bj⟧ n'arrive pas à exporter les déclarations nominatives. Propose une procédure de contournement.",
  },

  // —— Médical ——
  {
    id: "man-041",
    context: "Medical",
    markup:
      "Rédige le courrier de prise en charge pour ⟦PERSON|Nafissatou Bio Sanni⟧, ⟦JOB_TITLE|aide-soignante⟧ à la ⟦ORGANIZATION|Clinique Les Palmiers⟧, suivie pour une ⟦MEDICAL|drépanocytose⟧ depuis l'enfance.",
  },
  {
    id: "man-042",
    context: "Medical",
    markup:
      "L'agent est en arrêt pour ⟦MEDICAL|burn-out⟧ depuis 3 semaines, comment organiser son retour progressif ?",
    note: "Information de santé sans nom : annotée quand même.",
  },
  {
    id: "man-043",
    context: "Medical",
    markup:
      "Résume les règles d'indemnisation des maladies professionnelles reconnues au Bénin, avec un tableau.",
  },
  {
    id: "man-044",
    context: "Medical",
    markup:
      "M. ⟦PERSON|Ange Houénou⟧ est ⟦MEDICAL|séropositif⟧, il demande que son employeur ne soit pas informé. Comment rédiger l'avis d'aptitude ?",
  },
  {
    id: "man-045",
    context: "Medical",
    markup:
      "Ordonnance : metformine 850 mg matin et soir, pour ⟦MEDICAL|diabète de type 2⟧. Patient : ⟦PERSON|Comlan Ahouandjinou⟧, ⟦DATE_OF_BIRTH|12/04/1968⟧.",
    note: "Date de naissance sans libellé « né le ».",
  },
  {
    id: "man-046",
    context: "Medical",
    markup:
      "Ma collègue a eu un ⟦MEDICAL|AVC⟧ la semaine dernière, comment lui écrire un message de soutien de la part de l'équipe ?",
    note: "Pathologie d'une personne non identifiée : on annote quand même.",
  },

  // —— Générique ——
  {
    id: "man-047",
    context: "Generique",
    markup: "Donne-moi 10 idées de titres pour la newsletter interne du mois de novembre.",
  },
  {
    id: "man-048",
    context: "Generique",
    markup: "Corrige les fautes : « Les agent de la direction de Parakou sont convié a la reunion du 15/11/2026 a 10h. »",
    note: "Date de réunion et ville de service : négatifs difficiles.",
  },
  {
    id: "man-049",
    context: "Generique",
    markup: "Rédige un message d'anniversaire pour ⟦PERSON|Victoire Hounsou⟧ de la part de toute l'équipe du guichet.",
  },
  {
    id: "man-050",
    context: "Generique",
    markup: "Quel est le numéro vert de la CNSS pour les assurés ? Fais une affiche avec le slogan « Votre protection, notre mission ».",
  },
  {
    id: "man-051",
    context: "Generique",
    markup: "Peux-tu résumer en 5 lignes le rapport annuel 2025 (192 pages) ? Je te colle l'introduction ensuite.",
  },
  {
    id: "man-052",
    context: "Generique",
    markup: "Mon collègue ⟦PERSON|Pascal⟧ m'a dit que la réunion était annulée, tu peux rédiger un message pour prévenir les autres ?",
    note: "Prénom seul.",
  },
  {
    id: "man-053",
    context: "Generique",
    markup: "Contact du prestataire : ⟦PERSON|Yasmine Zannou⟧, ⟦PHONE|+229 97 45 12 36⟧, ⟦EMAIL|y.zannou@outlook.com⟧. Rédige l'invitation au comité.",
    note: "Ancien format béninois à 8 chiffres.",
  },
  {
    id: "man-054",
    context: "Generique",
    markup: "Envoie le compte rendu à ⟦EMAIL|direction.prestations@cnss.bj⟧ et mets ⟦EMAIL|secretariat.dg@cnss.bj⟧ en copie.",
    note: "Adresses de service : annotées (adresse électronique), même non nominatives.",
  },

  // —— Cas mixtes et pièges ——
  {
    id: "man-055",
    context: "Finance",
    markup:
      "Pour l'assuré ⟦PERSON|Koffi Djossou⟧ (CNSS ⟦CNSS_INSURED_NUMBER|C30917264⟧), verser la pension de ⟦FINANCIAL_AMOUNT|96 400⟧ FCFA sur ⟦IBAN|BJ59BJ0610100100144039000769⟧ et prévenir par SMS au ⟦PHONE|01 61 08 77 23⟧.",
  },
  {
    id: "man-056",
    context: "RH",
    markup:
      "Peux-tu anonymiser ce texte ? « ⟦PERSON|Boris Amoussou⟧, 34 ans, ⟦JOB_TITLE|électricien⟧ chez ⟦ORGANIZATION|BTP Mono Construction⟧, habite ⟦ADDRESS|Menontin⟧ et a eu un accident de chantier. »",
  },
  {
    id: "man-057",
    context: "Technique",
    markup:
      "Dans la base, la table assures contient nom, prénom, npi, date_naissance. Écris une vue SQL qui masque le npi sauf les 4 derniers chiffres.",
    note: "Noms de colonnes, aucune valeur : négatif difficile.",
  },
  {
    id: "man-058",
    context: "Generique",
    markup: "Le numéro de décret 2023-457 du 13 septembre 2023 fixe le SMIG à 52 000 FCFA. Explique son impact.",
    note: "Montant réglementaire public : non annoté.",
  },
  {
    id: "man-059",
    context: "RH",
    markup:
      "Mme ⟦PERSON|Edwige Kpadonou⟧, ⟦ADDRESS|carré 1245, quartier Agla, Cotonou⟧, demande une attestation de cessation de travail.",
    note: "Adresse complète : annotée en un seul span.",
  },
  {
    id: "man-060",
    context: "Finance",
    markup:
      "Paiement par carte ⟦CREDIT_CARD|5500-0000-0000-0004⟧ refusé, et le numéro de commande 4111 2233 n'apparaît pas. Que faire ?",
    note: "Numéro de commande à 8 chiffres : négatif difficile.",
  },
  {
    id: "man-061",
    context: "Medical",
    markup:
      "Pour le contrôle médical, ⟦PERSON|Gildas Sagbo⟧, ⟦DATE_OF_BIRTH|1985-06-21⟧, ⟦NATIONAL_ID|2045789013⟧, déclare une ⟦MEDICAL|hernie discale⟧ suite à un accident du travail.",
    note: "NPI et date sans libellé.",
  },
  {
    id: "man-062",
    context: "Technique",
    markup:
      "curl -H \"Authorization: Bearer ⟦API_KEY|eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbi1jbnNzIiwicm9sZSI6IkFETUlOIn0.k3Jp0Q9w2vX8tB1nM4cZ7yL6aE5sD3fG2hJ1kL0qW9e⟧\" https://api.exemple.com/v1/users renvoie 403",
  },
  {
    id: "man-063",
    context: "RH",
    markup:
      "Écris le discours de départ en retraite de ⟦PERSON|Rachidi Orou Yarou⟧, 32 ans de service, ancien ⟦JOB_TITLE|chef de garage⟧. Ton chaleureux.",
  },
  {
    id: "man-064",
    context: "Juridique",
    markup:
      "Peut-on transmettre à un cabinet externe la liste des assurés de ⟦ADDRESS|Malanville⟧ avec leurs numéros de téléphone ? Quelles précautions RGPD/APDP ?",
    note: "Commune liée à un groupe d'assurés : annotée ADDRESS.",
  },
  {
    id: "man-065",
    context: "Generique",
    markup: "Rédige un post LinkedIn pour célébrer les 55 ans de la CNSS, ton institutionnel, avec trois hashtags.",
  },
];

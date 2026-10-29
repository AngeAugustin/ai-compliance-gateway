import type { ContextCategory } from "../../packages/shared/src/index.js";
import { ann as A, type AnnotatedSource } from "./annotation.js";
import {
  COMMUNES,
  EMPLOYEURS,
  PATHOLOGIES,
  apiKey,
  beninIban,
  formatAmount,
  formatDate,
  mobileNumber,
  password,
  privateIp,
  randomToken,
  visaCard,
  type Person,
} from "./population.js";
import type { Rng } from "./rng.js";

/**
 * Corpus généré par gabarits à partir du registre synthétique. Les gabarits sont
 * rédigés comme des demandes réelles d'agents CNSS ; chacun porte ses annotations.
 * Biais connu : formulations répétitives → le corpus manuel sert de contrôle.
 */

interface Ctx {
  rng: Rng;
  p: Person;
  q: Person;
}

type Template = (c: Ctx) => { context: ContextCategory; markup: string };

const civ = (p: Person) => (p.sexe === "F" ? "Mme" : "M.");
const ne = (p: Person) => (p.sexe === "F" ? "née" : "né");
const nom = (p: Person) => A("PERSON", `${p.prenom} ${p.nom}`);
const date = (c: Ctx, p: Person) => A("DATE_OF_BIRTH", formatDate(p.naissance, c.rng.pick(["slash", "lettres", "slash"] as const)));
const montant = (c: Ctx, min: number, max: number) => formatAmount(c.rng.int(min, max) * 1000);
const ifu = (c: Ctx) => `${c.rng.pick(["3", "1"])}${c.rng.digits(12)}`;
const dossier = (c: Ctx) => `${c.rng.pick(["PRS", "REC", "AT", "DOS"])}-${c.rng.int(2023, 2026)}${c.rng.digits(4)}`;

export const TEMPLATES: Template[] = [
  // —— RH ——
  (c) => ({
    context: "RH",
    markup: `Rédige une réponse à la candidature de ${nom(c.p)} (${A("EMAIL", c.p.email)}) pour le poste de ${c.p.fonction}. Préciser que l'entretien aura lieu la semaine prochaine.`,
  }),
  (c) => ({
    context: "RH",
    markup: `Prépare un avenant au contrat de travail de ${civ(c.p)} ${nom(c.p)}, ${A("JOB_TITLE", c.p.fonction)}, pour un salaire brut mensuel de ${A("SALARY", formatAmount(c.p.salaire))} FCFA à compter du 1er du mois prochain.`,
  }),
  (c) => ({
    context: "RH",
    markup: `Peux-tu reformuler ce courrier de licenciement pour faute grave adressé à ${nom(c.p)}, ${ne(c.p)} le ${date(c, c.p)}, domicilié${c.p.sexe === "F" ? "e" : ""} à ${A("ADDRESS", c.p.quartier)}, ${A("ADDRESS", c.p.commune)} ? Le ton doit rester neutre.`,
  }),
  (c) => ({
    context: "RH",
    markup: `Fais un tableau des congés de l'équipe : ${nom(c.p)} du 3 au 14, ${nom(c.q)} du 17 au 28. Joignable au ${A("PHONE", c.q.telephone)} en cas d'urgence.`,
  }),
  (c) => ({
    context: "RH",
    markup: `Rédige une attestation de travail pour ${civ(c.p)} ${nom(c.p)}, employé${c.p.sexe === "F" ? "e" : ""} chez ${A("ORGANIZATION", c.p.employeur)} en qualité de ${A("JOB_TITLE", c.p.fonction)}, NPI ${A("NATIONAL_ID", c.p.npi)}.`,
  }),
  (c) => ({
    context: "RH",
    markup: `Résume les points forts d'un bon entretien annuel d'évaluation pour un poste de ${c.p.fonction}. Donne une grille en cinq critères.`,
  }),
  // —— Finance ——
  (c) => ({
    context: "Finance",
    markup: `Rédige l'ordre de virement de ${A("FINANCIAL_AMOUNT", montant(c, 50, 4000))} FCFA en faveur de ${nom(c.p)}, IBAN ${A("IBAN", c.p.iban)}, au titre du remboursement de cotisations.`,
  }),
  (c) => ({
    context: "Finance",
    markup: `Envoie ${A("FINANCIAL_AMOUNT", montant(c, 5, 300))} FCFA par MoMo au ${A("MOBILE_MONEY", c.p.momo)} pour l'assuré${c.p.sexe === "F" ? "e" : ""} ${nom(c.p)} et prépare le message de confirmation.`,
  }),
  (c) => ({
    context: "Finance",
    markup: `L'employeur ${A("ORGANIZATION", c.p.employeur)} (n° employeur ${A("CNSS_EMPLOYER_NUMBER", c.p.numeroEmployeur)}) n'a pas versé ses cotisations depuis trois mois. Montant dû : ${A("FINANCIAL_AMOUNT", montant(c, 200, 9000))} FCFA. Rédige une relance ferme.`,
  }),
  (c) => ({
    context: "Finance",
    markup: `Le paiement de la facture a été fait avec la carte ${A("CREDIT_CARD", visaCard(c.rng))}, expiration 09/27. Rédige la note pour la comptabilité.`,
  }),
  (c) => ({
    context: "Finance",
    markup: `Calcule les pénalités de retard pour une cotisation de ${A("SALARY", montant(c, 30, 900))} FCFA déclarée avec 45 jours de retard, au taux de 1 % par mois.`,
  }),
  (c) => ({
    context: "Finance",
    markup: `Explique la différence entre cotisation salariale et cotisation patronale au Bénin, avec un exemple chiffré simple.`,
  }),
  (c) => ({
    context: "Finance",
    markup: `Prépare le bordereau : société ${A("ORGANIZATION", c.p.employeur)}, IFU ${A("TAX_ID", ifu(c))}, virement vers ${A("IBAN", beninIban(c.rng, c.rng.chance(0.5)))}.`,
  }),
  // —— Juridique ——
  (c) => ({
    context: "Juridique",
    markup: `Rédige une mise en demeure à l'encontre de ${A("ORGANIZATION", c.p.employeur)} pour non-déclaration de ${nom(c.p)}, assuré${c.p.sexe === "F" ? "e" : ""} CNSS ${A("CNSS_INSURED_NUMBER", c.p.assure)}. Citer la procédure de contentieux.`,
  }),
  (c) => ({
    context: "Juridique",
    markup: `Quelles sont les voies de recours d'un assuré contre une décision de refus de pension ? Réponds avec les délais et la juridiction compétente.`,
  }),
  (c) => ({
    context: "Juridique",
    markup: `Rédige une procuration par laquelle ${nom(c.p)} autorise ${nom(c.q)} à retirer sa pension. Avocat : Me ${A("PERSON", `${c.rng.pick(["Sylvain", "Rodrigue", "Clarisse"])} ${c.rng.pick(["Adjaho", "Tchibozo", "Dègbo"])}`)}.`,
  }),
  (c) => ({
    context: "Juridique",
    markup: `Analyse ce litige : l'assurée réside à ${A("ADDRESS", c.p.commune)}, dossier ${A("INTERNAL_ID", dossier(c))}, et conteste le calcul de sa pension d'invalidité. Quelle clause du contrat s'applique ?`,
  }),
  // —— Technique ——
  (c) => ({
    context: "Technique",
    markup: `Pourquoi cette connexion échoue ? ${A("CONNECTION_STRING", `postgres://app_prestations:${password(c.rng)}@${privateIp(c.rng)}:5432/prestations`)} Le serveur répond « timeout ».`,
  }),
  (c) => ({
    context: "Technique",
    markup: `Corrige ce script Python :\nimport requests\nAPI_KEY = "${A("API_KEY", apiKey(c.rng))}"\nr = requests.get(URL, headers={"Authorization": API_KEY})\nIl renvoie une erreur 401.`,
  }),
  (c) => ({
    context: "Technique",
    markup: `Je n'arrive plus à me connecter au portail, identifiant ${A("EMAIL", c.p.email)}, mot de passe : ${A("PASSWORD", password(c.rng))}. Que dois-je vérifier ?`,
  }),
  (c) => {
    const ip = privateIp(c.rng);
    return {
      context: "Technique",
      markup: `Analyse ces logs :\n[ERROR] connexion refusée depuis ${A("IP_ADDRESS", ip)} vers ${A("INTERNAL_URL", `https://intranet.cnss.bj/prestations/api/v2/dossiers`)}\n[WARN] délai dépassé (ticket ${A("INTERNAL_ID", dossier(c))})`,
    };
  },
  (c) => ({
    context: "Technique",
    markup: `Écris une requête SQL qui compte les dossiers par statut et par mois dans la table prestations, triée par mois décroissant.`,
  }),
  (c) => ({
    context: "Technique",
    markup: `Ce token ne passe plus : Authorization: Bearer ${A("API_KEY", `eyJ${randomToken(c.rng, 20)}.eyJ${randomToken(c.rng, 30)}.${randomToken(c.rng, 25)}`)} — est-ce un problème d'expiration ?`,
  }),
  // —— Médical ——
  (c) => ({
    context: "Medical",
    markup: `Rédige la demande de prise en charge de ${nom(c.p)}, assuré${c.p.sexe === "F" ? "e" : ""} n° ${A("CNSS_INSURED_NUMBER", c.p.assure)}, hospitalisé${c.p.sexe === "F" ? "e" : ""} pour ${A("MEDICAL", c.rng.pick(PATHOLOGIES))} depuis le 4 du mois.`,
  }),
  (c) => ({
    context: "Medical",
    markup: `Le certificat médical indique : diagnostic : ${A("MEDICAL", c.rng.pick(PATHOLOGIES))}, arrêt de travail de 21 jours. Rédige le courrier à l'employeur ${A("ORGANIZATION", c.p.employeur)} sans mentionner la pathologie.`,
  }),
  (c) => ({
    context: "Medical",
    markup: `Quelles pièces faut-il fournir pour une déclaration d'accident du travail ? Fais une liste claire pour le guichet.`,
  }),
  (c) => ({
    context: "Medical",
    markup: `Le patient ${nom(c.p)}, ${ne(c.p)} le ${date(c, c.p)}, souffre de ${A("MEDICAL", c.rng.pick(PATHOLOGIES))}. Résume son dossier pour la commission d'invalidité.`,
  }),
  // —— Générique et négatifs difficiles ——
  (c) => ({
    context: "Generique",
    markup: `Fais le compte rendu de la réunion du ${c.rng.int(2, 28)}/${String(c.rng.int(1, 12)).padStart(2, "0")}/2026 : 12 participants, trois décisions, prochaine réunion dans 15 jours.`,
  }),
  (c) => ({
    context: "Generique",
    markup: `Traduis en anglais : « La direction départementale de ${c.rng.pick(COMMUNES)} sera fermée le 1er août pour inventaire. »`,
  }),
  (c) => ({
    context: "Generique",
    markup: `Rédige une note de service annonçant la nouvelle version du guide d'accueil (version 3.2, 48 pages) pour l'ensemble des agents.`,
  }),
  (c) => ({
    context: "Generique",
    markup: `Propose un planning de formation sur 5 jours pour 20 agents, de 8 h 30 à 12 h 30, salle 104.`,
  }),
  (c) => ({
    context: "Generique",
    markup: `Résume le décret n° 2024-${c.rng.int(100, 999)} en trois points simples pour le grand public.`,
  }),
  (c) => ({
    context: "Generique",
    markup: `Rédige une invitation à la cérémonie de remise de médailles du travail organisée par ${A("ORGANIZATION", c.rng.pick(EMPLOYEURS))} le mois prochain.`,
  }),
  (c) => ({
    context: "Generique",
    markup: `Appelle ${nom(c.p)} au ${A("PHONE", mobileNumber(c.rng))} pour confirmer sa présence à l'atelier de demain.`,
  }),
];

/** Échantillons courts : un gabarit tiré au hasard par échantillon. */
export function generateSamples(rng: Rng, people: Person[], count: number): AnnotatedSource[] {
  const out: AnnotatedSource[] = [];
  for (let i = 0; i < count; i++) {
    const template = rng.pick(TEMPLATES);
    const p = rng.pick(people);
    let q = rng.pick(people);
    while (q.id === p.id) q = rng.pick(people);
    const { context, markup } = template({ rng, p, q });
    out.push({ id: `gen-${String(i + 1).padStart(3, "0")}`, context, markup });
  }
  return out;
}

/**
 * Documents multi-demandes : plusieurs demandes collées, pour la latence et le découpage NER.
 * Un sur deux vise 300 à 900 caractères, l'autre 1 500 à 4 000 : les trois tranches de longueur sont peuplées.
 */
export function generateLongDocuments(rng: Rng, people: Person[], count: number): AnnotatedSource[] {
  const out: AnnotatedSource[] = [];
  for (let i = 0; i < count; i++) {
    const parts: string[] = [];
    let length = 0;
    const target = i % 2 === 0 ? rng.int(300, 900) : rng.int(1500, 4000);
    while (length < target) {
      const p = rng.pick(people);
      let q = rng.pick(people);
      while (q.id === p.id) q = rng.pick(people);
      const { markup } = rng.pick(TEMPLATES)({ rng, p, q });
      parts.push(markup);
      length += markup.length;
    }
    out.push({ id: `long-${String(i + 1).padStart(2, "0")}`, context: null, markup: parts.join("\n\n") });
  }
  return out;
}

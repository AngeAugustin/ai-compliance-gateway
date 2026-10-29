import type { Rng } from "./rng.js";

/**
 * Registre synthétique d'assurés (aucune personne réelle). Il alimente le corpus
 * généré et sert de « base auxiliaire » à l'attaquant de l'expérience de ré-identification.
 */

export const PRENOMS_F = [
  "Afiavi", "Akouavi", "Aïcha", "Bernadette", "Chimène", "Désirée", "Edwige", "Fatoumata", "Félicité", "Gisèle",
  "Grâce", "Hortense", "Mariam", "Mireille", "Nafissatou", "Rosine", "Sèna", "Sidonie", "Victoire", "Yasmine",
] as const;

export const PRENOMS_M = [
  "Abdou", "Ange", "Armel", "Boris", "Codjo", "Comlan", "Dossa", "Euloge", "Fiacre", "Gildas",
  "Hermann", "Ibrahim", "Kossi", "Koffi", "Landry", "Mathias", "Orou", "Rachidi", "Romuald", "Yacoubou",
] as const;

export const NOMS = [
  "Adjovi", "Agbo", "Agossou", "Ahouandjinou", "Akakpo", "Amoussou", "Assogba", "Bio Sanni", "Chabi", "Dansou",
  "Dossou", "Fagla", "Gbaguidi", "Hounkanrin", "Houngbédji", "Houénou", "Kpadonou", "Lokossou", "Orou Yarou", "Sagbo",
  "Sossa", "Tossou", "Yessoufou", "Zinsou", "Zannou", "Hounsou", "Gnonlonfoun", "Koudjo", "Ahyi", "Djossou",
] as const;

export const COMMUNES = [
  "Cotonou", "Porto-Novo", "Abomey-Calavi", "Parakou", "Bohicon", "Djougou", "Natitingou", "Lokossa",
  "Ouidah", "Kandi", "Abomey", "Savalou", "Allada", "Sèmè-Kpodji", "Malanville",
] as const;

export const QUARTIERS = [
  "Zogbo", "Akpakpa", "Gbégamey", "Cadjèhoun", "Fidjrossè", "Agla", "Godomey", "Houéyiho", "Kpondéhou",
  "Zongo", "Tokplégbé", "Ganhi", "Avotrou", "Sainte-Rita", "Menontin", "Vêdoko", "Togoudo", "Gbèdjromèdé",
] as const;

export const FONCTIONS = [
  "comptable", "chauffeur", "infirmière", "enseignant", "agent de sécurité", "caissière", "technicien de maintenance",
  "secrétaire de direction", "magasinier", "commercial", "aide-soignante", "électricien", "gestionnaire de stock",
  "juriste", "contrôleur de gestion", "agent d'entretien",
] as const;

/** Employeurs fictifs. */
export const EMPLOYEURS = [
  "Ets Houéto & Fils", "SARL Bénin Logistique", "Groupe Atlantique Services", "Clinique Les Palmiers",
  "Imprimerie du Zou", "Boulangerie La Lagune", "Transports Alafia", "Cabinet Kpodji Conseil",
  "Hôtel Le Belvédère", "Pharmacie Sainte Rita", "Société Ouémé Agro", "Collège Les Lauriers",
  "BTP Mono Construction", "Atelier Couture Dahomey", "Savonnerie de l'Ouémé",
] as const;

export const PATHOLOGIES = [
  "diabète de type 2", "hypertension artérielle", "drépanocytose", "tuberculose", "paludisme grave",
  "hépatite B", "insuffisance rénale", "épilepsie", "asthme", "hernie discale", "dépression", "VIH",
] as const;

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export interface Naissance {
  jour: number;
  mois: number;
  annee: number;
}

export interface Person {
  id: number;
  prenom: string;
  nom: string;
  sexe: "F" | "M";
  naissance: Naissance;
  commune: string;
  quartier: string;
  telephone: string;
  momo: string;
  email: string;
  npi: string;
  assure: string;
  employeur: string;
  numeroEmployeur: string;
  fonction: string;
  salaire: number;
  iban: string;
}

export function formatDate(d: Naissance, style: "slash" | "lettres" | "iso"): string {
  const dd = String(d.jour).padStart(2, "0");
  const mm = String(d.mois).padStart(2, "0");
  if (style === "slash") return `${dd}/${mm}/${d.annee}`;
  if (style === "iso") return `${d.annee}-${mm}-${dd}`;
  return `${d.jour === 1 ? "1er" : d.jour} ${MOIS[d.mois - 1]} ${d.annee}`;
}

/** Montant au format béninois : 350 000. */
export function formatAmount(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

const MOBILE_PREFIXES = ["42", "46", "50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "60", "61", "62", "63", "64", "65", "66", "67", "68", "69", "90", "91", "94", "95", "96", "97", "98", "99"];

/** Numéro mobile béninois à 10 chiffres (plan 2024), dans un format d'écriture courant. */
export function mobileNumber(rng: Rng, style?: "groupes" | "colle" | "international" | "points"): string {
  const digits = `01${rng.pick(MOBILE_PREFIXES)}${rng.digits(6)}`;
  const s = style ?? rng.pick(["groupes", "groupes", "colle", "international", "points"] as const);
  const pairs = digits.match(/\d{2}/g)!;
  if (s === "colle") return digits;
  if (s === "international") return `+229 ${pairs.join(" ")}`;
  if (s === "points") return pairs.join(".");
  return pairs.join(" ");
}

function ibanChecksum(country: string, bban: string): string {
  const rearranged = `${bban}${country}00`;
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const value = code >= 65 ? String(code - 55) : ch;
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return String(98 - remainder).padStart(2, "0");
}

/** IBAN béninois valide (28 caractères : BJkk + 2 lettres + 22 chiffres). */
export function beninIban(rng: Rng, spaced = true): string {
  const bban = `${rng.pick(["BJ", "CB", "EC", "OB", "BE"])}${rng.digits(22)}`;
  const iban = `BJ${ibanChecksum("BJ", bban)}${bban}`;
  return spaced ? iban.match(/.{1,4}/g)!.join(" ") : iban;
}

/** Carte Visa valide au sens de Luhn. */
export function visaCard(rng: Rng): string {
  const body = `4${rng.digits(14)}`;
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    let d = Number(body[body.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  const full = body + String((10 - (sum % 10)) % 10);
  return full.match(/\d{4}/g)!.join(" ");
}

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function randomToken(rng: Rng, length: number, alphabet = ALNUM): string {
  return Array.from({ length }, () => alphabet[rng.int(0, alphabet.length - 1)]).join("");
}

export function apiKey(rng: Rng): string {
  return rng.pick([
    () => `sk-${randomToken(rng, 40)}`,
    () => `ghp_${randomToken(rng, 36)}`,
    () => `AKIA${randomToken(rng, 16, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")}`,
    () => `AIza${randomToken(rng, 35)}`,
  ])();
}

export function password(rng: Rng): string {
  const base = rng.pick(["Cotonou", "Benin", "Cnss", "Lagune", "Soleil", "Ouidah", "Parakou"]);
  return `${base}${rng.pick(["@", "#", "!", "$"])}${rng.int(2019, 2026)}${rng.pick(["", "!", "*"])}`;
}

export function privateIp(rng: Rng): string {
  return rng.chance(0.5) ? `10.${rng.int(0, 40)}.${rng.int(0, 254)}.${rng.int(2, 254)}` : `192.168.${rng.int(0, 20)}.${rng.int(2, 254)}`;
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, "");
}

export function emailFor(rng: Rng, prenom: string, nom: string): string {
  const user = rng.pick([`${slug(prenom)}.${slug(nom)}`, `${slug(prenom)[0]}${slug(nom)}`, `${slug(nom)}${rng.int(70, 99)}`]);
  return `${user}@${rng.pick(["gmail.com", "yahoo.fr", "outlook.com", "hotmail.fr"])}`;
}

export function generatePopulation(rng: Rng, size: number): Person[] {
  const people: Person[] = [];
  const employerNumbers = new Map(EMPLOYEURS.map((e) => [e, `${rng.int(10, 99)}${rng.digits(6)}`]));
  for (let id = 0; id < size; id++) {
    const sexe = rng.chance(0.5) ? "F" : "M";
    const prenom = rng.pick(sexe === "F" ? PRENOMS_F : PRENOMS_M);
    const nom = rng.pick(NOMS);
    const employeur = rng.pick(EMPLOYEURS);
    people.push({
      id,
      prenom,
      nom,
      sexe,
      naissance: { jour: rng.int(1, 28), mois: rng.int(1, 12), annee: rng.int(1962, 2002) },
      commune: rng.pick(COMMUNES),
      quartier: rng.pick(QUARTIERS),
      telephone: mobileNumber(rng),
      momo: mobileNumber(rng),
      email: emailFor(rng, prenom, nom),
      npi: rng.digits(10),
      assure: `${rng.pick(["A", "B", "C"])}${rng.digits(8)}`,
      employeur,
      numeroEmployeur: employerNumbers.get(employeur)!,
      fonction: rng.pick(FONCTIONS),
      salaire: rng.int(52, 900) * 1000,
      iban: beninIban(rng),
    });
  }
  return people;
}

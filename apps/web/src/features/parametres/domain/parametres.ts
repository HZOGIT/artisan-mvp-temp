import type { RouterInputs, RouterOutputs } from "@/shared/trpc";

/*
 * Couche DOMAIN de la feature `parametres` (clean-archi) : types dérivés du routeur + mappers PURS
 * serveur↔formulaire + helpers (URL iCal, classe de badge lead). Aucune dépendance React/tRPC.
 * ⚠️ La sous-section « réglages vitrine » (vitrineActive/Description/Zone/Services/Experience) est
 * VOLONTAIREMENT ABSENTE : le new-stack n'a aucun endpoint write/read pour ces champs (finding)
 * → on ne migre pas une UI sans backend. À réintégrer quand livre `vitrine.updateSettings`.
 */

export type Parametres = RouterOutputs["parametres"]["get"];
export type ArtisanProfile = RouterOutputs["artisan"]["getProfile"];
export type IcalFeed = RouterOutputs["calendrier"]["getIcalFeed"];
export type UpdateParametresInput = RouterInputs["parametres"]["update"];
export type DemandeStatut = RouterInputs["vitrine"]["updateDemandeContactStatut"]["statut"];
export type DelaiPaiementType = NonNullable<UpdateParametresInput["delaiPaiementType"]>;
/** Réglages vitrine (endpoints backend livrés). La section « Ma page vitrine » est réintégrée. */
export type VitrineSettings = RouterOutputs["vitrine"]["getSettings"];
export type UpdateVitrineSettingsInput = RouterInputs["vitrine"]["updateSettings"];

/*
 * RÉSOLU : `vitrine.getDemandesContact` est désormais typé `DemandeContact[]` côté backend →
 * on dérive directement le type du routeur (plus d'interface locale ni d'assertion).
 */
export type DemandeContact = RouterOutputs["vitrine"]["getDemandesContact"][number];

export interface ParametresForm {
  prefixeDevis: string;
  prefixeFacture: string;
  mentionsLegalesDevis: string;
  mentionsLegalesFacture: string;
  mediateurConsommation: string;
  conditionsPaiementDefaut: string;
  delaiPaiementJours: string;
  delaiPaiementType: DelaiPaiementType;
  delaiValiditeDevis: string;
  notificationsEmail: boolean;
  rappelRdvClientActif: boolean;
  slug: string;
  couleurPrincipale: string;
  couleurSecondaire: string;
  /** Section « Ma page vitrine » (réglages publics) */
  vitrineActive: boolean;
  vitrineDescription: string;
  vitrineZone: string;
  /** textarea : un service par ligne */
  vitrineServices: string;
  vitrineExperience: string;
}

export const FORM_DEFAULTS: ParametresForm = {
  prefixeDevis: "DEV-",
  prefixeFacture: "FAC-",
  mentionsLegalesDevis: "",
  mentionsLegalesFacture: "",
  mediateurConsommation: "",
  conditionsPaiementDefaut: "Paiement à 30 jours",
  delaiPaiementJours: "",
  delaiPaiementType: "net",
  delaiValiditeDevis: "30",
  notificationsEmail: true,
  rappelRdvClientActif: true,
  slug: "",
  couleurPrincipale: "#4F46E5",
  couleurSecondaire: "#6366F1",
  vitrineActive: false,
  vitrineDescription: "",
  vitrineZone: "",
  vitrineServices: "",
  vitrineExperience: "",
};

/** `vitrineServices` est stocké en JSON (liste) côté serveur ; le formulaire l'affiche « un par ligne ». */
export function parseVitrineServices(raw: string | null): string {
  if (!raw) return "";
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x: unknown): x is string => typeof x === "string").join("\n") : raw;
  } catch {
    return raw;
  }
}
export function serializeVitrineServices(lines: string): string {
  return JSON.stringify(lines.split("\n").map((l) => l.trim()).filter(Boolean));
}

/** Fusionne les réglages vitrine (serveur) dans l'état du formulaire (les autres champs restent). */
export function applyVitrineToForm(form: ParametresForm, v: VitrineSettings): ParametresForm {
  return {
    ...form,
    vitrineActive: v.vitrineActive ?? false,
    vitrineDescription: v.vitrineDescription || "",
    vitrineZone: v.vitrineZone || "",
    vitrineServices: parseVitrineServices(v.vitrineServices),
    vitrineExperience: v.vitrineExperience != null ? String(v.vitrineExperience) : "",
  };
}

/** Mappe les champs vitrine du formulaire vers l'input de `vitrine.updateSettings`. */
export function formToVitrineInput(f: ParametresForm): UpdateVitrineSettingsInput {
  return {
    vitrineActive: f.vitrineActive,
    vitrineDescription: f.vitrineDescription || null,
    vitrineZone: f.vitrineZone || null,
    vitrineServices: serializeVitrineServices(f.vitrineServices),
    vitrineExperience: f.vitrineExperience ? (parseInt(f.vitrineExperience) || null) : null,
  };
}

/** Mappe les paramètres serveur (+ slug artisan) vers l'état du formulaire (parité legacy : défauts). */
export function parametresToForm(p: Parametres, slug: string): ParametresForm {
  return {
    /** Champs vitrine = défauts ; ils sont fusionnés ensuite par `applyVitrineToForm` (query séparée). */
    vitrineActive: FORM_DEFAULTS.vitrineActive,
    vitrineDescription: FORM_DEFAULTS.vitrineDescription,
    vitrineZone: FORM_DEFAULTS.vitrineZone,
    vitrineServices: FORM_DEFAULTS.vitrineServices,
    vitrineExperience: FORM_DEFAULTS.vitrineExperience,
    prefixeDevis: p.prefixeDevis || "DEV-",
    prefixeFacture: p.prefixeFacture || "FAC-",
    mentionsLegalesDevis: p.mentionsLegales || "",
    mentionsLegalesFacture: p.conditionsGenerales || "",
    mediateurConsommation: p.mediateurConsommation || "",
    conditionsPaiementDefaut: p.conditionsPaiementDefaut || "Paiement à 30 jours",
    delaiPaiementJours: p.delaiPaiementJours != null ? String(p.delaiPaiementJours) : "",
    delaiPaiementType: p.delaiPaiementType === "fin_de_mois" ? "fin_de_mois" : "net",
    delaiValiditeDevis: String(p.rappelDevisJours || 30),
    notificationsEmail: p.notificationsEmail ?? true,
    rappelRdvClientActif: p.rappelRdvClientActif ?? true,
    slug: slug || "",
    couleurPrincipale: p.couleurPrincipale || "#4F46E5",
    couleurSecondaire: p.couleurSecondaire || "#6366F1",
  };
}

/** Mappe le formulaire vers l'input de `parametres.update` (parité legacy ; champ vide → null/0/défaut). */
export function formToUpdateInput(f: ParametresForm): UpdateParametresInput {
  return {
    prefixeDevis: f.prefixeDevis,
    prefixeFacture: f.prefixeFacture,
    mentionsLegales: f.mentionsLegalesDevis,
    conditionsGenerales: f.mentionsLegalesFacture,
    mediateurConsommation: f.mediateurConsommation || null,
    conditionsPaiementDefaut: f.conditionsPaiementDefaut,
    delaiPaiementJours: f.delaiPaiementJours.trim() === "" ? null : (parseInt(f.delaiPaiementJours) || 0),
    delaiPaiementType: f.delaiPaiementType,
    notificationsEmail: f.notificationsEmail,
    rappelRdvClientActif: f.rappelRdvClientActif,
    rappelDevisJours: parseInt(f.delaiValiditeDevis) || 30,
    couleurPrincipale: f.couleurPrincipale,
    couleurSecondaire: f.couleurSecondaire,
  };
}

/** URL iCal complète à partir du chemin renvoyé par le serveur, "" si pas encore généré. */
export function buildIcalUrl(path: string | undefined | null, origin: string): string {
  return path ? `${origin}${path}` : "";
}

/** Classe de pastille de statut d'un lead vitrine (présentation). */
export function demandeStatutClass(statut: string): string {
  if (statut === "converti") return "bg-green-100 text-green-700";
  if (statut === "perdu") return "bg-gray-200 text-gray-600";
  if (statut === "contacte") return "bg-amber-100 text-amber-800";
  return "bg-blue-100 text-blue-700";
}

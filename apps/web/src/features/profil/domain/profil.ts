import type { RouterInputs, RouterOutputs } from "@/shared/trpc";

/*
 * Couche DOMAIN de la feature `profil` (profil entreprise de l'artisan + identifiants compte). Types dérivés
 * du routeur, catalogues, mapping form↔profil + validations PURS testables. 0 React/tRPC.
 */

export type Artisan = NonNullable<RouterOutputs["artisan"]["getProfile"]>;
export type UpdateProfileInput = RouterInputs["artisan"]["updateProfile"];
export type Specialite = NonNullable<UpdateProfileInput["specialite"]>;
export type FormeJuridique = NonNullable<UpdateProfileInput["formeJuridique"]>;

export const SPECIALITES: Specialite[] = ["plomberie", "electricite", "chauffage", "multi-services"];
/** Formes juridiques imposant capital social + ville RCS. */
export const SOCIETE_FORMES: FormeJuridique[] = ["EURL", "SARL", "SAS", "SASU", "SA"];
export const FORME_OPTIONS: { value: FormeJuridique | ""; labelKey: string }[] = [
  { value: "", labelKey: "formeNonPrecisee" }, { value: "EI", labelKey: "formeEI" }, { value: "micro", labelKey: "formeMicro" },
  { value: "EURL", labelKey: "formeEURL" }, { value: "SARL", labelKey: "formeSARL" }, { value: "SAS", labelKey: "formeSAS" },
  { value: "SASU", labelKey: "formeSASU" }, { value: "SA", labelKey: "formeSA" }, { value: "autre", labelKey: "formeAutre" },
];
export const METIERS_IA: { key: string; labelKey: string }[] = [
  { key: "plombier", labelKey: "metierPlombier" }, { key: "electricien", labelKey: "metierElectricien" },
  { key: "chauffagiste", labelKey: "metierChauffagiste" }, { key: "paysagiste", labelKey: "metierPaysagiste" },
  { key: "cuisiniste", labelKey: "metierCuisiniste" }, { key: "carreleur", labelKey: "metierCarreleur" },
  { key: "menuisier", labelKey: "metierMenuisier" }, { key: "macon", labelKey: "metierMacon" },
  { key: "peintre", labelKey: "metierPeintre" }, { key: "terrassier", labelKey: "metierTerrassier" },
  { key: "domotique", labelKey: "metierDomotique" }, { key: "autre", labelKey: "metierAutre" },
];

export type ProfilForm = {
  nomEntreprise: string; siret: string; numeroTVA: string; codeAPE: string; specialite: Specialite;
  metier: string; telephone: string; email: string; adresse: string; codePostal: string; ville: string;
  tauxTVA: string; iban: string; formeJuridique: FormeJuridique | ""; capitalSocial: string;
  villeRCS: string; numeroRM: string; franchiseTVA: boolean;
};

export function defaultProfilForm(): ProfilForm {
  return { nomEntreprise: "", siret: "", numeroTVA: "", codeAPE: "", specialite: "plomberie", metier: "",
    telephone: "", email: "", adresse: "", codePostal: "", ville: "", tauxTVA: "20", iban: "",
    formeJuridique: "", capitalSocial: "", villeRCS: "", numeroRM: "", franchiseTVA: false };
}

/** Remplit le formulaire depuis le profil (specialite hors-enum → "plomberie"). PUR. */
export function formFromArtisan(a: Artisan): ProfilForm {
  const spec = a.specialite && (SPECIALITES as string[]).includes(a.specialite) ? (a.specialite as Specialite) : "plomberie";
  const forme = a.formeJuridique && isFormeJuridique(a.formeJuridique) ? a.formeJuridique : "";
  const rawTaux = parseFloat(a.tauxTVA || "20");
  const tauxTVA = isNaN(rawTaux) ? "20" : String(rawTaux);
  return {
    nomEntreprise: a.nomEntreprise || "", siret: a.siret || "", numeroTVA: a.numeroTVA || "", codeAPE: a.codeAPE || "",
    specialite: spec, metier: a.metier || "", telephone: a.telephone || "", email: a.email || "",
    adresse: a.adresse || "", codePostal: a.codePostal || "", ville: a.ville || "", tauxTVA,
    iban: a.iban || "", formeJuridique: forme, capitalSocial: a.capitalSocial != null ? String(a.capitalSocial) : "",
    villeRCS: a.villeRCS || "", numeroRM: a.numeroRM || "", franchiseTVA: a.franchiseTVA ?? false,
  };
}

function isFormeJuridique(v: string): v is FormeJuridique {
  return (["EI", "micro", "EURL", "SARL", "SAS", "SASU", "SA", "autre"] as string[]).includes(v);
}

/** Payload de mise à jour (champs légaux optionnels vides → undefined). PUR. */
export function buildUpdatePayload(form: ProfilForm): UpdateProfileInput {
  return {
    nomEntreprise: form.nomEntreprise, siret: form.siret, numeroTVA: form.numeroTVA, codeAPE: form.codeAPE,
    specialite: form.specialite, metier: form.metier, telephone: form.telephone, email: form.email,
    adresse: form.adresse, codePostal: form.codePostal, ville: form.ville, tauxTVA: form.tauxTVA, iban: form.iban,
    formeJuridique: form.formeJuridique || undefined,
    capitalSocial: form.capitalSocial || undefined, villeRCS: form.villeRCS || undefined, numeroRM: form.numeroRM || undefined,
    franchiseTVA: form.franchiseTVA,
  };
}

/** Force du mot de passe (longueur). PUR. */
export function passwordStrength(pw: string): { labelKey: string; pct: number; color: string } {
  if (pw.length === 0) return { labelKey: "", pct: 0, color: "bg-muted" };
  if (pw.length < 6) return { labelKey: "pwFaible", pct: 30, color: "bg-rose-500" };
  if (pw.length <= 8) return { labelKey: "pwMoyen", pct: 60, color: "bg-amber-500" };
  return { labelKey: "pwFort", pct: 100, color: "bg-emerald-500" };
}

/** Validation du changement d'email → clé d'erreur i18n ou null. PUR. */
export function validateEmailChange(newEmail: string, confirmEmail: string, currentEmail: string): string | null {
  if (newEmail !== confirmEmail) return "errEmailMismatch";
  if (currentEmail && currentEmail === newEmail.trim()) return "errEmailSame";
  return null;
}

/** Validation du changement de mot de passe → clé d'erreur i18n ou null. PUR. */
export function validatePasswordChange(current: string, next: string, confirm: string): string | null {
  if (next.length < 6) return "errPwTooShort";
  if (next !== confirm) return "errPwMismatch";
  if (next === current) return "errPwSame";
  return null;
}

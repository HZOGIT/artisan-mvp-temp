import type { RouterInputs, RouterOutputs } from "@/shared/trpc";

/*
 * Couche DOMAIN de la feature `alertes-previsions` (alertes sur écarts de CA). Types dérivés du routeur,
 * helpers purs testables (montant, date-heure, type d'alerte). 0 dépendance React/tRPC.
 */

export type AlertesConfig = RouterOutputs["alertesPrevisions"]["getConfig"];
export type AlerteHistorique = RouterOutputs["alertesPrevisions"]["getHistorique"][number];
export type SaveConfigInput = RouterInputs["alertesPrevisions"]["saveConfig"];
export type Frequence = NonNullable<SaveConfigInput["frequenceVerification"]>;

export type AlertesForm = {
  seuilAlertePositif: string; seuilAlerteNegatif: string; alerteEmail: boolean; alerteSms: boolean;
  emailDestination: string; telephoneDestination: string; frequenceVerification: Frequence; actif: boolean;
};

export const FREQUENCES: readonly Frequence[] = ["quotidien", "hebdomadaire", "mensuel"];

/** Alerte positive (CA > prévision) vs négative. PUR. */
export function isAlertePositive(type: string): boolean {
  return type === "positif";
}

/** Montant string/null → « 1 234€ » (entiers FR). PUR. */
export function formatMontant(value: string | number | null | undefined): string {
  const v = typeof value === "string" ? parseFloat(value) : Number(value || 0);
  return `${(Number.isFinite(v) ? v : 0).toLocaleString("fr-FR")}€`;
}

/** Date + heure courtes FR. PUR. */
export function formatDateHeure(date: Date | string): string {
  return new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/*
 * Canal d'envoi (`email`/`sms`/`les_deux`) → a-t-il l'email / le SMS. PUR. (Le new-stack a un seul
 * `canalEnvoi`, le legacy avait 2 booléens `emailEnvoye`/`smsEnvoye`.)
 */
export function canalHasEmail(canal: string): boolean {
  return canal === "email" || canal === "les_deux";
}
export function canalHasSms(canal: string): boolean {
  return canal === "sms" || canal === "les_deux";
}

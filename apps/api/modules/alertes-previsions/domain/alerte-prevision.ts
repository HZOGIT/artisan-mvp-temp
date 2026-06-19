/*
 * Domaine « alertes du prévisionnel de trésorerie » (parité legacy `alertesPrevisions`). Compare le
 * CA réalisé du mois au CA prévisionnel ; au-delà d'un seuil (+/-), enregistre une alerte d'historique.
 */

export type AlerteFrequence = "quotidien" | "hebdomadaire" | "mensuel";
export type AlerteType = "depassement_positif" | "depassement_negatif";
export type AlerteCanal = "email" | "sms" | "les_deux";
export type AlerteStatut = "envoye" | "echec" | "lu";

/*
 * Configuration d'alerte d'un artisan (1 par tenant, clé unique artisanId). Numériques en string
 * (parité Drizzle `numeric`). `null` = pas encore configuré.
 */
export interface AlerteConfig {
  readonly seuilAlertePositif: string | null;
  readonly seuilAlerteNegatif: string | null;
  readonly alerteEmail: boolean | null;
  readonly alerteSms: boolean | null;
  readonly emailDestination: string | null;
  readonly telephoneDestination: string | null;
  readonly frequenceVerification: AlerteFrequence | null;
  readonly actif: boolean | null;
}

// Patch d'upsert (toutes optionnelles ; le client ne fournit jamais artisanId).
export interface SaveAlerteConfigInput {
  readonly seuilAlertePositif?: string;
  readonly seuilAlerteNegatif?: string;
  readonly alerteEmail?: boolean;
  readonly alerteSms?: boolean;
  readonly emailDestination?: string;
  readonly telephoneDestination?: string;
  readonly frequenceVerification?: AlerteFrequence;
  readonly actif?: boolean;
}

// Ligne d'historique d'alerte (lecture + insertion).
export interface AlerteHistorique {
  readonly id: number;
  readonly mois: number;
  readonly annee: number;
  readonly typeAlerte: AlerteType;
  readonly caPrevisionnel: string | null;
  readonly caRealise: string | null;
  readonly ecartPourcentage: string | null;
  readonly canalEnvoi: AlerteCanal;
  readonly dateEnvoi: Date;
  readonly statut: AlerteStatut | null;
  readonly message: string | null;
}

// Écart en % du réalisé vs prévisionnel (parité legacy). PUR.
export function calculerEcartPct(caReel: number, caPrev: number): number {
  return ((caReel - caPrev) / caPrev) * 100;
}

/*
 * Type d'alerte déclenché selon l'écart et les seuils (positif/négatif), sinon null. PUR.
 * Défaut des seuils = 10 % (parité legacy). Seuils en valeur absolue (% de dépassement).
 */
export function evaluerTypeAlerte(ecartPct: number, seuilPositif: number, seuilNegatif: number): AlerteType | null {
  if (ecartPct >= seuilPositif) return "depassement_positif";
  if (ecartPct <= -seuilNegatif) return "depassement_negatif";
  return null;
}

// Canal d'envoi choisi selon la config (parité legacy : défaut email si rien). PUR.
export function choisirCanal(alerteEmail: boolean | null, alerteSms: boolean | null): AlerteCanal {
  if (alerteEmail && alerteSms) return "les_deux";
  if (alerteEmail) return "email";
  if (alerteSms) return "sms";
  return "email";
}

// Message d'alerte (parité legacy, libellés/format à l'identique). PUR.
export function construireMessage(type: AlerteType, caReel: number, caPrev: number, ecartPct: number, mois: number, annee: number): string {
  return type === "depassement_positif"
    ? `Bonne nouvelle : votre CA realise (${caReel.toFixed(0)} EUR) depasse de ${ecartPct.toFixed(1)}% le previsionnel (${caPrev.toFixed(0)} EUR) pour ${mois}/${annee}.`
    : `Attention : votre CA realise (${caReel.toFixed(0)} EUR) est inferieur de ${Math.abs(ecartPct).toFixed(1)}% au previsionnel (${caPrev.toFixed(0)} EUR) pour ${mois}/${annee}.`;
}

/*
 * Seuil numérique depuis la config, parité legacy EXACTE `Number(config.seuil || 10)` : valeur
 * falsy (null/undefined/chaîne vide) → 10 ; sinon `Number(v)` (ex. "0.00" → 0, "10.00" → 10).
 */
export function seuilOuDefaut(v: string | null | undefined): number {
  return Number(v || 10);
}

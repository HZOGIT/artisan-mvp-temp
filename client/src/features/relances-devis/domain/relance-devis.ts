import type { RouterOutputs } from "@/shared/trpc";

// Couche DOMAIN de la feature `relances-devis` (clean-archi) : type dérivé du routeur + fonctions
// PURES (formatage, partition par email, message de relance par défaut, toggle jour d'envoi).
// Aucune dépendance React/tRPC.

export type DevisNonSigne = RouterOutputs["devis"]["getDevisNonSignes"][number];

// Libellés des jours (lundi=1 … dimanche=7, indices alignés sur le format CSV `joursEnvoi`).
export const JOURS_SEMAINE = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] as const;

// Formatage monétaire € (parité legacy : null → "0,00 €").
export function formatCurrency(value: string | number | null): string {
  if (value === null) return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(0);
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number.isNaN(num) ? 0 : num);
}

// Sépare les devis relançables par email de ceux qui requièrent une relance manuelle (pas d'email).
export function partitionByEmail(items: readonly DevisNonSigne[]): {
  avecEmail: DevisNonSigne[];
  sansEmail: DevisNonSigne[];
} {
  const avecEmail: DevisNonSigne[] = [];
  const sansEmail: DevisNonSigne[] = [];
  for (const item of items) {
    if (item.client?.email) avecEmail.push(item);
    else sansEmail.push(item);
  }
  return { avecEmail, sansEmail };
}

// Message de relance pré-rempli (parité legacy : numéro + montant formaté dans un corps standard).
export function defaultRelanceMessage(numero: string, montantFormate: string): string {
  return `Bonjour,

Nous vous rappelons que le devis n°${numero} d'un montant de ${montantFormate} est toujours en attente de votre signature.

N'hésitez pas à nous contacter pour toute question.

Cordialement`;
}

// Ajoute/retire un jour (numéro "1".."7") dans la liste CSV `joursEnvoi`, en gardant l'ordre trié.
export function toggleJourEnvoi(joursEnvoi: string, jourNum: string): string {
  const jours = joursEnvoi.split(",").filter((j) => j);
  if (jours.includes(jourNum)) {
    return jours.filter((j) => j !== jourNum).join(",");
  }
  return [...jours, jourNum].sort().join(",");
}

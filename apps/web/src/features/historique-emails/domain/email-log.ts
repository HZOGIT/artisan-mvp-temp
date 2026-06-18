import type { RouterOutputs } from "@/shared/trpc";

// Couche DOMAINE de la feature `historique-emails` (journal des envois d'emails, lecture seule)
// (clean-archi) : types dérivés des sorties du routeur tRPC + règles PURES testables sans réseau ni i18n.

export type EmailLog = RouterOutputs["emails"]["list"][number];

// Valeurs des filtres de statut (les libellés sont gérés en i18n côté UI).
export const STATUT_FILTRES = ["tous", "envoye", "echec", "simule"] as const;
export type StatutFiltre = (typeof STATUT_FILTRES)[number];

export type EmailStatutKind = "envoye" | "echec" | "simule" | "other";

// Catégorie PURE d'un statut d'email (l'UI mappe vers badge + libellé i18n).
export function emailStatutKind(statut: string): EmailStatutKind {
  return statut === "envoye" || statut === "echec" || statut === "simule" ? statut : "other";
}

// Filtrage PUR par statut ("tous" = pas de filtre). Mêmes règles que le legacy.
export function filterByStatut(rows: readonly EmailLog[], statutFiltre: string): EmailLog[] {
  return rows.filter((r) => statutFiltre === "tous" || r.statut === statutFiltre);
}

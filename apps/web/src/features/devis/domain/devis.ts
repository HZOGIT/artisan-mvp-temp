import type { RouterOutputs } from "@/shared/trpc";
import { matchSearch } from "@/shared/lib/normalize";

/*
 * Couche DOMAINE de la feature `devis` (clean-archi) : types dérivés des sorties du routeur tRPC
 * (source de vérité serveur) + règles PURES testables sans réseau ni i18n.
 */

export type Devis = RouterOutputs["devis"]["list"][number];
export type DevisClient = RouterOutputs["clients"]["list"][number];

/** Statuts gérés par les filtres (ordre d'affichage). Concept métier → vit dans le domaine. */
export const STATUT_KEYS = ["brouillon", "envoye", "accepte", "refuse", "expire"] as const;
export type DevisStatut = (typeof STATUT_KEYS)[number];

/** Garde de type PURE : la chaîne est-elle un statut de devis géré ? (filtre piloté par l'URL). */
export function isDevisStatut(s: string): s is DevisStatut {
  return (STATUT_KEYS as readonly string[]).includes(s);
}

/** Libellé « Nom Prénom » d'un client (tolère prénom absent / client introuvable). */
export function clientLabel(c: Pick<DevisClient, "nom" | "prenom"> | undefined): string {
  if (!c) return "";
  return `${c.nom ?? ""} ${c.prenom ?? ""}`.trim();
}

export interface DevisFilters {
  statusFilter: string;
  searchQuery: string;
  /** Résolveur de nom client (l'index Map vit côté UI) — garde le domaine pur. */
  resolveClientName: (clientId: number | null) => string;
}

/** Filtrage PUR (statut + recherche numéro/objet/nom client). Mêmes règles que le legacy. */
export function filterDevis(devisList: readonly Devis[], f: DevisFilters): Devis[] {
  return devisList.filter((devis) => {
    if (f.statusFilter !== "all" && devis.statut !== f.statusFilter) return false;
    if (!f.searchQuery) return true;
    const clientName = f.resolveClientName(devis.clientId);
    return (
      matchSearch(devis.numero, f.searchQuery) ||
      matchSearch(devis.objet, f.searchQuery) ||
      matchSearch(clientName, f.searchQuery)
    );
  });
}

/** Décompte PUR par statut (pour les pastilles de filtres). */
export function countByStatut(devisList: readonly Devis[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const devis of devisList) {
    acc[devis.statut] = (acc[devis.statut] ?? 0) + 1;
  }
  return acc;
}

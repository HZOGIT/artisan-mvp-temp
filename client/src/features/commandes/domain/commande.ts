import type { RouterOutputs } from "@/shared/trpc";
import { matchSearch } from "@/shared/lib/normalize";

// Couche DOMAINE de la feature `commandes` (bons de commande fournisseurs) (clean-archi) : types dérivés
// des sorties du routeur tRPC + règles PURES testables sans réseau ni i18n.

export type Commande = RouterOutputs["commandesFournisseurs"]["list"][number];
export type CommandeFournisseur = RouterOutputs["fournisseurs"]["list"][number];

export const STATUT_KEYS = ["brouillon", "envoyee", "confirmee", "livree", "annulee"] as const;
export type CommandeStatut = (typeof STATUT_KEYS)[number];

export function isCommandeStatut(s: string): s is CommandeStatut {
  return (STATUT_KEYS as readonly string[]).includes(s);
}

export interface CommandeFilters {
  filterStatut: string;
  filterFournisseur: string;
  searchQuery: string;
  // Résolveur de nom fournisseur : le DTO `commandesFournisseurs.list` n'expose PAS de `fournisseurNom`
  // (seulement `fournisseurId`) — le nom est résolu via la liste des fournisseurs côté UI. Garde le
  // domaine pur. (Le legacy lisait `c.fournisseurNom` via `any` → undefined → colonne/recherche cassées.)
  resolveFournisseurNom: (fournisseurId: number | null) => string;
}

// Filtrage PUR (statut + fournisseur + recherche numéro/fournisseur/référence). Mêmes règles que le legacy.
export function filterCommandes(list: readonly Commande[], f: CommandeFilters): Commande[] {
  return list.filter((c) => {
    if (f.filterStatut !== "tous" && c.statut !== f.filterStatut) return false;
    if (f.filterFournisseur !== "tous" && String(c.fournisseurId) !== f.filterFournisseur) return false;
    if (!f.searchQuery) return true;
    return (
      matchSearch(c.numero, f.searchQuery) ||
      matchSearch(f.resolveFournisseurNom(c.fournisseurId), f.searchQuery) ||
      matchSearch(c.reference, f.searchQuery)
    );
  });
}

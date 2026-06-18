import type { RouterOutputs } from "@/shared/trpc";
import { matchSearch } from "@/shared/lib/normalize";

// Couche DOMAINE de la feature `fournisseurs` (clean-archi) : types dérivés des sorties du routeur tRPC
// + règles PURES testables sans réseau ni i18n.

export type Fournisseur = RouterOutputs["fournisseurs"]["list"][number];
export type Article = RouterOutputs["articles"]["getArtisanArticles"][number];
export type FournisseurArticle = RouterOutputs["fournisseurs"]["getFournisseurArticles"][number];

// Recherche PURE fournisseurs (nom / contact / ville). Mêmes règles que le legacy.
export function filterFournisseurs(list: readonly Fournisseur[], query: string): Fournisseur[] {
  return list.filter(
    (f) => matchSearch(f.nom, query) || matchSearch(f.contact, query) || matchSearch(f.ville, query),
  );
}

// Recherche PURE articles (désignation / référence).
export function filterArticles(list: readonly Article[], query: string): Article[] {
  return list.filter((a) => matchSearch(a.designation, query) || matchSearch(a.reference, query));
}

export interface FournisseurStats {
  total: number;
  withEmail: number;
  withPhone: number;
}

// Stats PURES de l'en-tête (total / avec email / avec téléphone).
export function fournisseurStats(list: readonly Fournisseur[]): FournisseurStats {
  return {
    total: list.length,
    withEmail: list.filter((f) => !!f.email).length,
    withPhone: list.filter((f) => !!f.telephone).length,
  };
}

// Index PUR articleId → article (pour résoudre le détail d'une association).
export function indexArticlesById(list: readonly Article[]): Map<number, Article> {
  return new Map(list.map((a) => [a.id, a]));
}

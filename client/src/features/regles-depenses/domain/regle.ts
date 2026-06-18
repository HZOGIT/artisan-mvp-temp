import type { RouterOutputs } from "@/shared/trpc";

// Couche DOMAINE de la feature `regles-depenses` (règles de catégorisation auto des dépenses)
// (clean-archi) : types dérivés des sorties du routeur tRPC + règles PURES testables sans réseau ni i18n.

export type Regle = RouterOutputs["depenses"]["getRegles"][number];
export type Categorie = RouterOutputs["depenses"]["getCategories"][number];

// Normalisation PURE du motif saisi (trim + MAJUSCULES) avant création — comme le legacy.
export function normalizeMotif(motif: string): string {
  return motif.trim().toUpperCase();
}

// Validation PURE : motif non vide + catégorie choisie.
export function isRegleValid(motif: string, categorie: string): boolean {
  return motif.trim().length > 0 && categorie.length > 0;
}

// Index PUR catégorie (par nom) → pour résoudre la couleur d'affichage d'une règle.
export function indexCategoriesByNom(categories: readonly Categorie[]): Map<string, Categorie> {
  return new Map(categories.map((c) => [c.nom, c]));
}

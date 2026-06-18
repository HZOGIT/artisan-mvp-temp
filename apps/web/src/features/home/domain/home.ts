// Couche DOMAIN de la page vitrine (`/home`, legacy `/`). Page statique : pas de données serveur, la
// logique pure se limite à la tarification (cycle mensuel/annuel) et aux dimensions des sections (servent
// à zipper les tableaux i18n avec les données structurelles — icônes/accents — côté UI). 0 dépendance React.

export type BillingCycle = "monthly" | "annual";

// Remise annuelle legacy : −20 % arrondi à l'euro. PUR.
export const ANNUAL_DISCOUNT = 0.2;
export function priceFor(monthly: number, cycle: BillingCycle): number {
  return cycle === "annual" ? Math.round(monthly * (1 - ANNUAL_DISCOUNT)) : monthly;
}

// Nombre d'éléments par section (parité legacy) — garde-fou de cohérence i18n ↔ données structurelles.
export const SECTION_COUNTS = {
  navItems: 4,
  primaryFeatures: 3,
  secondaryFeatures: 6,
  sectors: 6,
  steps: 3,
  plans: 3,
  testimonials: 3,
  faq: 9,
} as const;

import type { RouterOutputs } from "@/shared/trpc";

/*
 * Couche DOMAINE de la feature `modules` (activation des modules/fonctionnalités) (clean-archi) : types
 * dérivés des sorties du routeur tRPC + règles PURES testables sans réseau ni i18n.
 */

export type Module = RouterOutputs["modules"]["list"][number];

export const CATEGORIES = ["commercial", "clients", "terrain", "gestion", "ia", "parametres"] as const;
export type Categorie = (typeof CATEGORIES)[number];

export const PLANS = ["essentiel", "pro", "entreprise"] as const;
export type Plan = (typeof PLANS)[number];

/** Slugs des modules mis en avant ("Les plus utilisés"). Concept produit → vit dans le domaine. */
export const POPULAR_SLUGS = ["devis", "factures", "assistant_ia", "interventions", "clients"];

/*
 * Gardes PURES : ramènent une chaîne libre vers un membre connu (sinon défaut). Le DTO type `categorie`/
 * `planMinimum` en `string` ; on les normalise pour indexer les méta de présentation sans `any`.
 */
export function toCategorie(c: string): Categorie {
  return (CATEGORIES as readonly string[]).includes(c) ? (c as Categorie) : "parametres";
}
export function toPlan(p: string): Plan {
  return (PLANS as readonly string[]).includes(p) ? (p as Plan) : "essentiel";
}

/** Filtrage PUR par catégorie ("all" = tous). */
export function filterByCategorie(modules: readonly Module[], filter: Categorie | "all"): Module[] {
  return filter === "all" ? [...modules] : modules.filter((m) => m.categorie === filter);
}

/** Modules "populaires" présents, dans l'ordre des slugs. PUR. */
export function popularModules(modules: readonly Module[], slugs: readonly string[]): Module[] {
  return slugs.map((s) => modules.find((m) => m.slug === s)).filter((m): m is Module => !!m);
}

export interface ModuleCounts {
  actifs: number;
  total: number;
}

/** Compteurs PURS (total tombe à 15 si liste vide, comme le legacy). */
export function moduleCounts(modules: readonly Module[]): ModuleCounts {
  return { actifs: modules.filter((m) => m.actif).length, total: modules.length || 15 };
}

/** % de progression PUR (modules actifs / total). */
export function progressPct(counts: ModuleCounts): number {
  return counts.total > 0 ? (counts.actifs / counts.total) * 100 : 0;
}

/** Nombre de modules d'une catégorie (pour les pastilles de filtre). PUR. */
export function countByCategorie(modules: readonly Module[], cat: Categorie): number {
  return modules.filter((m) => m.categorie === cat).length;
}

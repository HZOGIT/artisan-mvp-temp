import type { ModuleAvecEtat, ModuleCatalogue } from "./module";

/** Hiérarchie des plans (parité legacy). Un module exige un plan ≥ son `planMinimum`. */
const PLAN_ORDER: Record<string, number> = { essentiel: 0, pro: 1, entreprise: 2 };

/** Le plan de l'artisan est-il INSUFFISANT pour ce module ? (plan inconnu → traité comme « essentiel »). */
export function isPlanInsuffisant(planModule: string, planArtisan: string | null | undefined): boolean {
  const m = PLAN_ORDER[planModule] ?? 0;
  const a = PLAN_ORDER[planArtisan || "essentiel"] ?? 0;
  return m > a;
}

/*
 * Enrichit le catalogue avec l'état du tenant : `actif` (présent dans les slugs actifs) et `locked`
 * (plan insuffisant). Fonction pure — testable sans DB.
 */
export function enrichirModules(
  catalogue: readonly ModuleCatalogue[],
  slugsActifs: readonly string[],
  plan: string | null | undefined,
): ModuleAvecEtat[] {
  const actifs = new Set(slugsActifs);
  return catalogue.map((m) => ({
    ...m,
    actif: actifs.has(m.slug),
    locked: isPlanInsuffisant(m.planMinimum, plan),
  }));
}

import type { RouterOutputs } from "@/shared/trpc";

// Couche DOMAIN du `tableau-bord-depenses`. Types dérivés du routeur, agrégats/dérivations purs testables
// (séries graphiques, alertes budget, projection). 0 dépendance React/tRPC.

export type Stats = RouterOutputs["depenses"]["stats"];
export type Budget = RouterOutputs["depenses"]["getBudgets"][number];
export type Categorie = RouterOutputs["depenses"]["getCategories"][number];

export type DonutDatum = { name: string; value: number; color: string };
export type BarDatum = { mois: string; total: number };

// Montant € (entiers), tolérant string/number/null. PUR.
export function eur(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? parseFloat(n) : Number(n || 0);
  return (Number.isFinite(v) ? v : 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

// Données du donut « par catégorie » (couleur résolue depuis les catégories). PUR.
export function donutData(stats: Stats | undefined, categories: readonly Categorie[]): DonutDatum[] {
  if (!stats?.parCategorie) return [];
  return stats.parCategorie.map((c) => ({
    name: c.categorie,
    value: Number(c.total || 0),
    color: categories.find((x) => x.nom === c.categorie)?.couleur || "#94a3b8",
  }));
}

// Données de la barre « évolution 6 mois » — `formatMois` injecté par l'UI (date-fns). PUR.
export function barData(stats: Stats | undefined, formatMois: (mois: string) => string): BarDatum[] {
  if (!stats?.parMois) return [];
  return stats.parMois.map((m) => ({ mois: formatMois(m.mois), total: Number(m.total || 0) }));
}

// Budgets en alerte (budget défini + consommation ≥ 80%). PUR.
export function alertesBudget(budgets: readonly Budget[]): Budget[] {
  return budgets.filter((b) => Number(b.budget || 0) > 0 && Number(b.pct || 0) >= 80);
}

// Budget total + % consommé du mois. PUR.
export function totalBudget(budgets: readonly Budget[]): number {
  return budgets.reduce((s, b) => s + Number(b.budget || 0), 0);
}
export function pctBudget(totalMois: number, totalBudgetVal: number): number {
  return totalBudgetVal > 0 ? Math.round((totalMois / totalBudgetVal) * 100) : 0;
}

// Projection fin de mois (extrapolation linéaire) — uniquement pour le mois courant. PUR.
export function projection(totalMois: number, mois: string, now: Date = new Date()): number | null {
  if (!totalMois) return null;
  const [y, m] = mois.split("-").map(Number);
  if (y !== now.getFullYear() || m !== now.getMonth() + 1) return null;
  const jour = now.getDate();
  const joursDansLeMois = new Date(y, m, 0).getDate();
  return totalMois * (joursDansLeMois / jour);
}

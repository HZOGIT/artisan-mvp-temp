import type { RouterOutputs } from "@/shared/trpc";

/*
 * Couche DOMAINE de la feature `budgets-depenses` (budgets de dépenses par catégorie) (clean-archi) :
 * types dérivés des sorties du routeur tRPC + règles PURES testables sans réseau ni i18n.
 */

export type Budget = RouterOutputs["depenses"]["getBudgets"][number];

const toNum = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
};

export interface BudgetTotals {
  budget: number;
  reel: number;
  restant: number;
}

/** Totaux PURS du mois (budget / réalisé / restant). */
export function budgetTotals(budgets: readonly Budget[]): BudgetTotals {
  const budget = budgets.reduce((s, b) => s + toNum(b.budget), 0);
  const reel = budgets.reduce((s, b) => s + toNum(b.reel), 0);
  return { budget, reel, restant: budget - reel };
}

/** % de consommation global (réalisé / budget). null si budget nul (rien à afficher). PUR. */
export function consommationPct(totals: BudgetTotals): number | null {
  return totals.budget > 0 ? Math.round((totals.reel / totals.budget) * 100) : null;
}

/** Mois précédent au format "YYYY-MM". PUR. */
export function moisPrecedent(mois: string): string {
  const [yStr, mStr] = mois.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = new Date(y, m - 2, 1);
  return d.toISOString().slice(0, 7);
}

export type BudgetLevel = "ok" | "warn" | "over";

/** Niveau PUR de consommation d'une catégorie (l'UI mappe vers une couleur Tailwind). Seuils legacy. */
export function budgetLevel(pct: number): BudgetLevel {
  if (pct > 100) return "over";
  if (pct > 75) return "warn";
  return "ok";
}

/** Barre de progression bornée à 100 %. PUR. */
export function clampPct(pct: number): number {
  return Math.min(100, Math.max(0, pct));
}

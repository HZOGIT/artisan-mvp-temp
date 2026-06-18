import type { RouterInputs, RouterOutputs } from "@/shared/trpc";

// Couche DOMAIN de la feature `previsions` (prévisions de CA). Types dérivés du routeur, agrégats purs
// testables (totaux, écart, confiance). 0 dépendance React/tRPC. Le module est keyé `previsions`.

export type Prevision = RouterOutputs["previsions"]["getPrevisions"][number];
export type Comparaison = RouterOutputs["previsions"]["getComparaison"][number];
export type HistoriqueItem = RouterOutputs["previsions"]["getHistorique"][number];
export type Methode = NonNullable<RouterInputs["previsions"]["calculer"]["methode"]>;

export const MOIS_LABELS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
] as const;
export const METHODES: readonly Methode[] = ["moyenne_mobile", "regression_lineaire", "saisonnalite"];

// Nombre depuis une valeur string|number|null (repli 0). PUR.
export function num(value: string | number | null | undefined): number {
  const v = typeof value === "string" ? parseFloat(value) : Number(value ?? 0);
  return Number.isFinite(v) ? v : 0;
}

export function totalPrevisionnel(previsions: readonly Prevision[]): number {
  return previsions.reduce((sum, p) => sum + num(p.caPrevisionnel), 0);
}
export function totalRealise(previsions: readonly Prevision[]): number {
  return previsions.reduce((sum, p) => sum + num(p.caRealise), 0);
}
export function confianceMoyenne(previsions: readonly Prevision[]): number {
  if (previsions.length === 0) return 0;
  return previsions.reduce((sum, p) => sum + num(p.confiance), 0) / previsions.length;
}

// % d'écart total (réalisé vs prévisionnel), 0 si pas de prévisionnel. PUR.
export function ecartPct(prevTotal: number, realiseTotal: number): number {
  return prevTotal > 0 ? ((realiseTotal - prevTotal) / prevTotal) * 100 : 0;
}

// Classe de pastille d'un niveau de confiance (≥70 vert, ≥50 jaune, sinon rouge). PUR.
export function confianceClass(confiance: number): string {
  if (confiance >= 70) return "bg-green-100 text-green-800";
  if (confiance >= 50) return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

import type { RouterOutputs } from "@/modern/shared/trpc";

// Couche DOMAINE de la feature `depenses` (clean-archi) : types dérivés des sorties du routeur tRPC +
// règles PURES testables sans réseau ni i18n (totaux, plage de mois, indemnité km, index catégories).

export type Depense = RouterOutputs["depenses"]["list"][number];
export type DepenseStats = RouterOutputs["depenses"]["stats"];
export type Categorie = RouterOutputs["depenses"]["getCategories"][number];
export type Budget = RouterOutputs["depenses"]["getBudgets"][number];
export type KmClient = RouterOutputs["clients"]["list"][number];

export const TARIF_KM_DEFAULT = 0.529; // Barème fiscal voiture <= 5 CV, <= 5000 km/an
export const STATUT_KEYS = ["brouillon", "soumise", "approuvee", "rejetee", "remboursee"] as const;
export type DepenseStatut = (typeof STATUT_KEYS)[number];

const toNum = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
};

// Budget total PUR (somme des budgets du mois).
export function budgetTotal(budgets: readonly Budget[]): number {
  return budgets.reduce((s, b) => s + toNum(b.budget), 0);
}

// Index PUR catégorie (par nom) → pour résoudre la couleur d'affichage.
export function indexCategoriesByNom(categories: readonly Categorie[]): Map<string, Categorie> {
  return new Map(categories.map((c) => [c.nom, c]));
}

// Montant PUR d'une indemnité kilométrique (arrondi 2 décimales).
export function montantIndemniteKm(km: number, tarif: number): number {
  return +(km * tarif).toFixed(2);
}

// Plage de dates PURE d'un mois "YYYY-MM" → { debut: 1er, fin: dernier jour } (ISO yyyy-mm-dd).
export function monthRange(mois: string): { debut: string; fin: string } {
  const [yStr, mStr] = mois.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const debut = `${mois}-01`;
  const fin = new Date(y, m, 0).toISOString().slice(0, 10);
  return { debut, fin };
}

// Libellé de motif PUR à partir du trajet (depart → arrivee) et/ou du motif. "" si vide (l'UI applique
// un libellé par défaut i18n).
export function buildTrajetMotif(depart: string, arrivee: string, motif: string): string {
  const parts: string[] = [];
  if (depart || arrivee) parts.push(`${depart || "?"} → ${arrivee || "?"}`);
  if (motif) parts.push(motif);
  return parts.join(" — ");
}

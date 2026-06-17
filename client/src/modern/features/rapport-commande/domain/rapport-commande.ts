import type { RouterOutputs } from "@/modern/shared/trpc";

// Couche DOMAIN de la feature `rapport-commande` (articles en rupture à commander par fournisseur).
// Types dérivés du routeur, agrégats purs testables. 0 dépendance React/tRPC.

export type RapportCommande = RouterOutputs["stocks"]["getRapportCommande"];
export type CommandeFournisseur = RapportCommande[number];
export type Artisan = RouterOutputs["artisan"]["getProfile"];

// Montant formaté en euros. PUR.
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}

// Nombre total d'articles (toutes commandes confondues). PUR.
export function totalArticles(rapport: RapportCommande): number {
  return rapport.reduce((sum, c) => sum + c.lignes.length, 0);
}

// Montant total estimé (toutes commandes confondues). PUR.
export function totalMontant(rapport: RapportCommande): number {
  return rapport.reduce((sum, c) => sum + c.totalCommande, 0);
}

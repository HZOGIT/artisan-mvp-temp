import type { RouterInputs, RouterOutputs } from "@/modern/shared/trpc";

// Couche DOMAIN de la feature `performances-fournisseurs` (délais & fiabilité fournisseurs). Types dérivés
// du routeur (`commandesFournisseurs`/`fournisseurs`), agrégats/règles purs testables. 0 React/tRPC.

export type Performance = RouterOutputs["commandesFournisseurs"]["getPerformances"][number];
export type Commande = RouterOutputs["commandesFournisseurs"]["list"][number];
export type Fournisseur = RouterOutputs["fournisseurs"]["list"][number];
export type StatutCommande = RouterInputs["commandesFournisseurs"]["updateStatut"]["statut"];

export const STATUTS_COMMANDE = ["en_attente", "confirmee", "expediee", "livree", "annulee"] as const;

// Montant formaté en euros. PUR.
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}

// Date courte FR, « - » si nulle. PUR.
export function formatDate(date: Date | string | null | undefined): string {
  return date ? new Date(date).toLocaleDateString("fr-FR") : "-";
}

// Pastille de statut : classe de fond (confirmee/expediee/livree) ou null (variante). PUR.
export function statutClass(statut: string | null): string | null {
  switch (statut) {
    case "confirmee": return "bg-blue-100 text-blue-800";
    case "expediee": return "bg-purple-100 text-purple-800";
    case "livree": return "bg-green-100 text-green-800";
    default: return null;
  }
}
export function statutVariant(statut: string | null): "outline" | "destructive" | undefined {
  if (statut === "annulee") return "destructive";
  if (statutClass(statut)) return undefined;
  return "outline"; // en_attente / inconnu
}

// Couleur de texte d'un taux de fiabilité (≥90 vert, ≥70 jaune, sinon rouge). PUR.
export function fiabiliteColor(taux: number): string {
  if (taux >= 90) return "text-green-600";
  if (taux >= 70) return "text-yellow-600";
  return "text-red-600";
}
// Niveau (pour l'icône) : up ≥90, warn ≥70, down sinon. PUR.
export function fiabiliteLevel(taux: number): "up" | "warn" | "down" {
  if (taux >= 90) return "up";
  if (taux >= 70) return "warn";
  return "down";
}

export type GlobalStats = { totalCommandes: number; totalLivrees: number; totalEnRetard: number; montantTotalGlobal: number; tauxFiabiliteGlobal: number };

// Statistiques globales agrégées sur toutes les performances. PUR.
export function globalStats(performances: readonly Performance[]): GlobalStats {
  const totalCommandes = performances.reduce((s, p) => s + p.totalCommandes, 0);
  const totalLivrees = performances.reduce((s, p) => s + p.commandesLivrees, 0);
  const totalEnRetard = performances.reduce((s, p) => s + p.commandesEnRetard, 0);
  const montantTotalGlobal = performances.reduce((s, p) => s + p.montantTotal, 0);
  const tauxFiabiliteGlobal = totalCommandes > 0 ? Math.round(((totalLivrees - totalEnRetard) / totalCommandes) * 100) : 100;
  return { totalCommandes, totalLivrees, totalEnRetard, montantTotalGlobal, tauxFiabiliteGlobal };
}

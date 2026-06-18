import type { RouterOutputs } from "@/shared/trpc";

// Couche DOMAIN de la feature `rdv-en-ligne` (demandes de RDV clients). Types dérivés du routeur (`rdv`),
// règles pures testables (classes de statut/urgence, nom client). 0 dépendance React/tRPC.

export type RdvItem = RouterOutputs["rdv"]["list"][number];
export type RdvStats = RouterOutputs["rdv"]["getStats"];

export const STATUT_FILTERS = ["tous", "en_attente", "confirme", "refuse"] as const;

// Filtre la liste par statut (« tous » = tout) — le new-stack `rdv.list` ne prend pas de filtre. PUR.
export function filterByStatut(rdvList: readonly RdvItem[], filter: string): RdvItem[] {
  return filter === "tous" ? rdvList.slice() : rdvList.filter((r) => r.statut === filter);
}

// Classe de pastille d'un statut de RDV (libellé i18n `statut.<statut>`). PUR.
export function statutClass(statut: string): string {
  switch (statut) {
    case "en_attente": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "confirme": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "refuse": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "annule": return "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400";
    default: return "";
  }
}

// Classe de pastille d'un niveau d'urgence (libellé i18n `urgence.<urgence>`). PUR.
export function urgenceClass(urgence: string): string {
  switch (urgence) {
    case "urgente": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    case "tres_urgente": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    default: return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"; // normale
  }
}

// Nom complet d'un client de RDV (repli « Client inconnu »). PUR.
export function clientName(client: RdvItem["client"] | null | undefined): string {
  if (!client) return "";
  return `${client.prenom || ""} ${client.nom}`.trim();
}

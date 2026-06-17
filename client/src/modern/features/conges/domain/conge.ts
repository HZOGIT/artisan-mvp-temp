import type { RouterInputs, RouterOutputs } from "@/modern/shared/trpc";

// Couche DOMAIN de la feature `conges` (clean-archi) : types dérivés du routeur + fonctions PURES
// (aucune dépendance React/tRPC) → testables en isolation. Domaine RH sensible côté backend
// (anti self-approbation, idempotence du décompte) ; côté front on porte le calcul de durée, la
// résolution du nom de technicien et le filtrage par statut (onglets) sans `any`.

export type Conge = RouterOutputs["conges"]["list"][number];
export type CongeEnAttente = RouterOutputs["conges"]["enAttente"][number];
export type Technicien = RouterOutputs["techniciens"]["getAll"][number];
export type TypeConge = RouterInputs["conges"]["create"]["type"];
export type StatutConge = Conge["statut"];

// Ordre/valeurs canoniques (parité legacy) — les libellés vivent dans l'i18n, pas ici.
export const TYPES_CONGE = ["conge_paye", "rtt", "maladie", "sans_solde", "formation", "autre"] as const;
export const STATUTS = ["en_attente", "approuve", "refuse", "annule"] as const;

// Nombre de jours INCLUSIF entre deux dates (parité legacy : `ceil(|d2-d1|/jour) + 1`). Ordre
// indifférent (valeur absolue). Dates invalides → 0 (garde-fou, ne jette jamais).
export function calculerJours(debut: string, fin: string): number {
  const d1 = new Date(debut).getTime();
  const d2 = new Date(fin).getTime();
  if (Number.isNaN(d1) || Number.isNaN(d2)) return 0;
  const diff = Math.abs(d2 - d1);
  return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
}

// Nom affichable d'un technicien à partir de son id. Renvoie la chaîne « prénom nom » nettoyée,
// ou `null` si le technicien est introuvable (l'UI substitue alors un libellé i18n « Inconnu »).
export function technicienNom(
  techniciens: readonly Technicien[],
  technicienId: number,
): string | null {
  const tech = techniciens.find((t) => t.id === technicienId);
  if (!tech) return null;
  return `${tech.prenom ?? ""} ${tech.nom ?? ""}`.trim();
}

// Filtre les congés par statut (onglets « approuvés » / « refusés »).
export function filterByStatut(conges: readonly Conge[], statut: StatutConge): Conge[] {
  return conges.filter((c) => c.statut === statut);
}

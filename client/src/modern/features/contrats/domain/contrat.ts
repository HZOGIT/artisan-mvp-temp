import { matchSearch } from "@/lib/normalize";
import type { RouterOutputs } from "@/modern/shared/trpc";

// Couche DOMAIN de la feature `contrats` (clean-archi) : types dérivés du routeur + fonctions PURES
// (filtrage/recherche, stats CA récurrent, variante de badge). Aucune dépendance React/tRPC.
// Domaine semi-sensible financier : montants HT en string (numeric PG), `reference` serveur.

export type Contrat = RouterOutputs["contrats"]["list"][number];
export type Client = RouterOutputs["clients"]["list"][number];
export type ContratType = Contrat["type"];
export type Periodicite = Contrat["periodicite"];
export type ContratStatut = Contrat["statut"];

export const TYPES_CONTRAT = ["entretien", "maintenance_preventive", "depannage", "contrat_service"] as const;
export const PERIODICITES = ["mensuel", "trimestriel", "semestriel", "annuel"] as const;
export const STATUTS = ["actif", "suspendu", "termine", "annule"] as const;

// Multiplicateur annuel par périodicité (CA récurrent annualisé).
export const PERIODICITE_MULT: Record<Periodicite, number> = {
  mensuel: 12,
  trimestriel: 4,
  semestriel: 2,
  annuel: 1,
};

// ⚠️ Le `contrats.list` new-stack renvoie le contrat SANS jointure client (juste `clientId`) — on
// résout donc le nom depuis la liste `clients` déjà chargée (même donnée, jointure côté front).
export function clientNom(clients: readonly Client[], clientId: number): string {
  const c = clients.find((x) => x.id === clientId);
  if (!c) return "";
  return `${c.nom ?? ""} ${c.prenom ?? ""}`.trim();
}

export interface ContratStats {
  readonly total: number;
  readonly actifs: number;
  readonly caAnnuel: number;
}

// Stats d'en-tête : total, nb actifs, CA annuel récurrent (somme des montants HT actifs × multiplicateur).
export function computeStats(contrats: readonly Contrat[]): ContratStats {
  const actifs = contrats.filter((c) => c.statut === "actif");
  const caAnnuel = actifs.reduce((sum, c) => {
    const montant = parseFloat(c.montantHT || "0");
    const mult = PERIODICITE_MULT[c.periodicite] ?? 1;
    return sum + (Number.isNaN(montant) ? 0 : montant) * mult;
  }, 0);
  return { total: contrats.length, actifs: actifs.length, caAnnuel };
}

export interface FilterOptions {
  readonly search: string;
  readonly statut: string; // "tous" ou un ContratStatut
  readonly nomClient: (contrat: Contrat) => string;
}

// Filtre par statut (« tous » = pas de filtre) puis recherche accent-insensible sur référence / titre /
// nom du client (résolu via `nomClient` injecté).
export function filterContrats(contrats: readonly Contrat[], opts: FilterOptions): Contrat[] {
  return contrats.filter((c) => {
    if (opts.statut !== "tous" && c.statut !== opts.statut) return false;
    if (!opts.search) return true;
    return (
      matchSearch(c.reference, opts.search) ||
      matchSearch(c.titre, opts.search) ||
      matchSearch(opts.nomClient(c), opts.search)
    );
  });
}

export type StatutVariant = "default" | "secondary" | "destructive" | "outline";

// Variante visuelle du badge de statut (le libellé passe par l'i18n, pas ici).
export function statutVariant(statut: string): StatutVariant {
  switch (statut) {
    case "actif":
      return "default";
    case "suspendu":
      return "secondary";
    case "annule":
      return "destructive";
    default:
      return "outline";
  }
}

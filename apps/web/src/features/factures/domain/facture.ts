import type { RouterOutputs } from "@/shared/trpc";
import { matchSearch } from "@/shared/lib/normalize";

/*
 * Couche DOMAINE de la feature `factures` (clean-archi) : types dérivés des sorties du routeur tRPC
 * (source de vérité serveur) + règles PURES testables sans réseau ni i18n. L'UI/l'application en
 * dépendent ; aucune connaissance du transport ici.
 */

export type Facture = RouterOutputs["factures"]["list"][number];
export type FactureClient = RouterOutputs["clients"]["list"][number];
export type EncoursClient = RouterOutputs["clients"]["getEncours"];

export type TypeFilter = "tous" | "facture" | "avoir";

/** Parse tolérant : montants stockés en `string` (numeric PG) → number, jamais NaN. */
const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
};

export const isBrouillon = (statut: string | null | undefined): boolean => statut === "brouillon";

/** Libellé « Nom Prénom » d'un client (tolère prénom absent / client introuvable). */
export function clientLabel(c: Pick<FactureClient, "nom" | "prenom"> | undefined): string {
  if (!c) return "";
  return `${c.nom ?? ""} ${c.prenom ?? ""}`.trim();
}

export interface FactureFilters {
  typeFilter: TypeFilter;
  statusFilter: string;
  searchQuery: string;
  /** Résolveur de nom client (l'index Map vit côté application/UI) — garde le domaine pur. */
  resolveClientName: (clientId: number | null) => string;
}

/** Filtrage PUR (type document + statut piloté par l'URL + recherche texte). Mêmes règles que le legacy. */
export function filterFactures(factures: readonly Facture[], f: FactureFilters): Facture[] {
  return factures.filter((facture) => {
    if (f.typeFilter !== "tous") {
      const docType = facture.typeDocument || "facture";
      if (docType !== f.typeFilter) return false;
    }
    if (f.statusFilter === "impayees") {
      if (facture.statut === "payee" || facture.statut === "annulee" || facture.statut === "brouillon") {
        return false;
      }
    } else if (f.statusFilter === "en_retard") {
      if (facture.statut !== "en_retard") return false;
    } else if (f.statusFilter === "brouillon") {
      if (facture.statut !== "brouillon") return false;
    }
    if (!f.searchQuery) return true;
    const clientName = f.resolveClientName(facture.clientId);
    return (
      matchSearch(facture.numero, f.searchQuery) ||
      matchSearch(facture.objet, f.searchQuery) ||
      matchSearch(clientName, f.searchQuery)
    );
  });
}

export interface EncoursSummary {
  hasReelles: boolean;
  totalImpaye: number;
  totalEnRetard: number;
  impayeesCount: number;
}

/*
 * Synthèse PURE de l'encours (à encaisser / en retard / nb impayées), avoirs déduits du total impayé.
 * Reproduit exactement le calcul à la volée du legacy.
 */
export function computeEncoursSummary(factures: readonly Facture[]): EncoursSummary {
  const reelles = factures.filter((f) => f.typeDocument !== "avoir");
  if (reelles.length === 0) {
    return { hasReelles: false, totalImpaye: 0, totalEnRetard: 0, impayeesCount: 0 };
  }
  const reste = (f: Facture) => Math.max(0, num(f.totalTTC) - num(f.montantPaye));
  const impayees = reelles.filter(
    (f) => f.statut === "envoyee" || f.statut === "en_retard" || f.statut === "validee",
  );
  const creditAvoirs = factures
    .filter((f) => f.typeDocument === "avoir" && f.statut !== "annulee" && f.statut !== "brouillon")
    .reduce((s, f) => s + Math.abs(num(f.totalTTC)), 0);
  const totalImpaye = Math.max(0, impayees.reduce((s, f) => s + reste(f), 0) - creditAvoirs);
  const totalEnRetard = Math.min(
    reelles.filter((f) => f.statut === "en_retard").reduce((s, f) => s + reste(f), 0),
    totalImpaye,
  );
  return { hasReelles: true, totalImpaye, totalEnRetard, impayeesCount: impayees.length };
}

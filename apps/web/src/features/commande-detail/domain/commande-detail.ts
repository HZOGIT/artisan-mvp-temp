import type { RouterInputs, RouterOutputs } from "@/shared/trpc";

/*
 * Couche DOMAIN de la feature `commande-detail` (bon de commande fournisseur). Types dérivés du routeur,
 * catalogues de statut, agrégats + payload de réception purs testables. 0 React/tRPC.
 */

/*
 * ⚠️ Le new-stack `getById` renvoie la commande SEULE (sans `lignes` ni `fournisseur`) — le legacy lisait
 * `commande.lignes`/`.fournisseur` (inexistants, masqués par `any`) → on charge les lignes via `getLignes`
 * et le fournisseur via `fournisseurs.list`.
 */
export type Commande = NonNullable<RouterOutputs["commandesFournisseurs"]["getById"]>;
export type Ligne = RouterOutputs["commandesFournisseurs"]["getLignes"][number];
export type Fournisseur = RouterOutputs["fournisseurs"]["list"][number];
export type Depense = RouterOutputs["depenses"]["list"][number];

/** Fournisseur d'une commande (lookup par id). PUR. */
export function findFournisseur(fournisseurs: readonly Fournisseur[], fournisseurId: number | null | undefined): Fournisseur | undefined {
  return fournisseurId == null ? undefined : fournisseurs.find((f) => f.id === fournisseurId);
}
export type StatutCommande = RouterInputs["commandesFournisseurs"]["updateStatut"]["statut"];
export type StatutFacturation = RouterInputs["commandesFournisseurs"]["setStatutFacturation"]["statutFacturation"];

export const STATUS_LABEL_KEY: Record<string, string> = {
  brouillon: "statutBrouillon", envoyee: "statutEnvoyee", confirmee: "statutConfirmee",
  partiellement_livree: "statutPartiellementLivree", livree: "statutLivree", annulee: "statutAnnulee",
};
export const STATUS_COLORS: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700", envoyee: "bg-blue-100 text-blue-700", confirmee: "bg-orange-100 text-orange-700",
  partiellement_livree: "bg-amber-100 text-amber-700", livree: "bg-green-100 text-green-700", annulee: "bg-red-100 text-red-700",
};
export const NEXT_STATUSES: Record<string, StatutCommande[]> = {
  brouillon: ["envoyee", "annulee"], envoyee: ["confirmee", "annulee"], confirmee: ["livree", "annulee"],
  partiellement_livree: ["livree", "annulee"], livree: [], annulee: [],
};

/** Montant € (tolérant string/number/null). PUR. */
export function formatCurrency(value: number | string | null | undefined): string {
  const num = typeof value === "string" ? parseFloat(value) : Number(value ?? 0);
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number.isFinite(num) ? num : 0);
}

const n = (v: unknown): number => parseFloat(String(v ?? "")) || 0;

/** Total HT d'une ligne (quantité × prix unitaire). PUR. */
export function ligneTotal(ligne: Ligne): number { return n(ligne.quantite) * n(ligne.prixUnitaire); }

/** La réception est-elle éditable (commande en cours) ? PUR. */
export function receptionActive(statut: string): boolean { return ["envoyee", "confirmee", "partiellement_livree"].includes(statut); }
/** La commande est-elle (partiellement) reçue ? PUR. */
export function estRecue(statut: string): boolean { return ["partiellement_livree", "livree"].includes(statut); }
/** Au moins une quantité reçue ? PUR. */
export function aDesQuantitesRecues(lignes: readonly Ligne[]): boolean { return lignes.some((l) => n(l.quantiteRecue) > 0); }

export type ReceptionLigne = { ligneId: number; quantiteRecue: number };

/** Construit le payload de réception (valeur saisie sinon quantité déjà reçue). PUR. */
export function buildReceptionPayload(lignes: readonly Ligne[], recue: Record<number, string>): ReceptionLigne[] {
  return lignes
    .filter((l): l is Ligne & { id: number } => l.id != null)
    .map((l) => ({ ligneId: l.id, quantiteRecue: recue[l.id] !== undefined ? n(recue[l.id]) : n(l.quantiteRecue) }));
}

/** Libellé d'une dépense (fournisseur / description / « Dépense #id »). PUR. */
export function depenseLabel(d: Depense): string {
  return d.fournisseur || d.description || `Dépense #${d.id}`;
}

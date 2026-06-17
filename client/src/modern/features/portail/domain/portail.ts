import type { RouterOutputs } from "@/modern/shared/trpc";

// Couche DOMAIN de la feature `portail` (clean-archi) — espace client PUBLIC par token (`/v2/portail/$token`).
// SLICE 1 (socle) : vérification d'accès. Les onglets (devis/factures/paiement/interventions/chantiers/
// rdv/chat/demande IA) arrivent en slices ultérieurs. Types dérivés du routeur, 0 dépendance React/tRPC.

export type VerifyAccess = RouterOutputs["clientPortal"]["verifyAccess"];

// Onglets de l'espace client (parité legacy : ordre + valeurs). Le contenu se remplit slice par slice.
export const PORTAIL_TABS = ["demande", "devis", "factures", "interventions", "messages", "rdv", "chantier", "infos"] as const;
export type PortailTab = (typeof PORTAIL_TABS)[number];

// ── SLICE 2 : Devis + Factures + paiement Stripe ──────────────────────────────────────────────────
export type PortailDevis = RouterOutputs["clientPortal"]["getDevis"][number];
export type PortailFacture = RouterOutputs["clientPortal"]["getFactures"][number];

// Format monétaire € (parité legacy : null → 0). PUR.
export function formatCurrency(amount: number | string | null | undefined): string {
  const num = typeof amount === "string" ? parseFloat(amount) : Number(amount ?? 0);
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number.isNaN(num) ? 0 : num);
}

// Classe de badge d'un statut de devis (le libellé passe par l'i18n `devisStatut.<statut>`). PUR.
export function devisStatutClass(statut: string): string {
  switch (statut) {
    case "envoye": return "bg-blue-100 text-blue-700 border-blue-200";
    case "accepte": return "bg-green-100 text-green-700 border-green-200";
    case "refuse": return "bg-red-100 text-red-700 border-red-200";
    case "expire": return "bg-orange-100 text-orange-700 border-orange-200";
    default: return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

// Classe de badge d'un statut de facture (libellé i18n `factureStatut.<statut>`). PUR.
export function factureStatutClass(statut: string): string {
  switch (statut) {
    case "validee": return "bg-amber-100 text-amber-800 border-amber-200";
    case "envoyee": return "bg-blue-100 text-blue-700 border-blue-200";
    case "payee": return "bg-green-100 text-green-700 border-green-200";
    case "en_retard": return "bg-red-100 text-red-700 border-red-200";
    default: return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

// Une facture est-elle payable en ligne ? (envoyée ou en retard). PUR.
export function isFacturePayable(statut: string): boolean {
  return statut === "envoyee" || statut === "en_retard";
}

import type { RouterInputs, RouterOutputs } from "@/modern/shared/trpc";

// Couche DOMAIN de la feature `portail` (clean-archi) — espace client PUBLIC par token (`/portail/$token`).
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

// ── SLICE 3 : Interventions + Suivi chantiers ─────────────────────────────────────────────────────
export type PortailIntervention = RouterOutputs["clientPortal"]["getInterventions"][number];
export type PortailChantier = RouterOutputs["clientPortal"]["getSuiviChantiers"][number];

// Classe de badge d'un statut d'intervention (libellé i18n `interventionStatut.<statut>`). PUR.
export function interventionStatutClass(statut: string): string {
  switch (statut) {
    case "planifiee": return "bg-blue-100 text-blue-700 border-blue-200";
    case "en_cours": return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "terminee": return "bg-green-100 text-green-700 border-green-200";
    case "annulee": return "bg-red-100 text-red-700 border-red-200";
    default: return "bg-gray-100 text-gray-700";
  }
}

// Classe de badge d'un statut de chantier (couleur uniquement ; le libellé = statut « humanisé »). PUR.
export function chantierStatutClass(statut: string): string {
  switch (statut) {
    case "termine": return "bg-green-100 text-green-800";
    case "en_cours": return "bg-blue-100 text-blue-800";
    case "en_pause": return "bg-yellow-100 text-yellow-800";
    default: return "bg-gray-100 text-gray-800";
  }
}

// Prochaine intervention « planifiée » à venir (la + proche par date), `null` sinon. PUR.
export function prochaineIntervention(interventions: readonly PortailIntervention[], now: Date = new Date()): PortailIntervention | null {
  const futures = interventions
    .filter((i) => new Date(i.dateIntervention) >= now && i.statut === "planifiee")
    .sort((a, b) => new Date(a.dateIntervention).getTime() - new Date(b.dateIntervention).getTime());
  return futures[0] ?? null;
}

// ── SLICE 4 : Prise de RDV ─────────────────────────────────────────────────────────────────────────
export type PortailRdv = RouterOutputs["clientPortal"]["getMesRdv"][number];
export type RdvUrgence = RouterInputs["clientPortal"]["demanderRdv"]["urgence"];

// Groupe les créneaux ISO par jour (YYYY-MM-DD), ordre des jours préservé (insertion). PUR.
export function groupSlotsByDay(slots: readonly string[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const slot of slots) {
    const day = new Date(slot).toISOString().split("T")[0];
    (grouped[day] ??= []).push(slot);
  }
  return grouped;
}

// Classe de pastille d'un statut de RDV (libellé i18n `rdvStatut.<statut>`). PUR.
export function rdvStatutClass(statut: string): string {
  switch (statut) {
    case "confirme": return "bg-green-100 text-green-700";
    case "refuse": return "bg-red-100 text-red-700";
    case "annule": return "bg-gray-100 text-gray-500";
    default: return "bg-yellow-100 text-yellow-700"; // en_attente
  }
}

// ── SLICE 5 : Messages / Chat ──────────────────────────────────────────────────────────────────────
export type PortailConversation = RouterOutputs["clientPortal"]["getConversations"][number];
export type PortailMessage = RouterOutputs["clientPortal"]["getConversationMessages"][number];

// Total des messages non lus côté client (badge de l'onglet). PUR.
export function totalUnread(conversations: readonly PortailConversation[]): number {
  return conversations.reduce((sum, c) => sum + (c.nonLuClient || 0), 0);
}

// Date courte d'un message (parité legacy : heure du jour / "Hier" / jour de semaine / date). PUR.
export function formatChatDate(date: Date | string, now: Date = new Date()): string {
  const d = new Date(date);
  const days = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Hier";
  if (days < 7) return d.toLocaleDateString("fr-FR", { weekday: "long" });
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// ── SLICE 6 : Demande IA + Mes infos (dernier onglet) ────────────────────────────────────────────────
export type DemandeStructured = RouterOutputs["clientPortal"]["soumettreDemandeIA"]["structured"];
export type PortailClientInfo = NonNullable<RouterOutputs["clientPortal"]["getClientInfo"]>;

// Suggestions de projet (chips) du formulaire de demande IA — parité legacy. PUR.
export const EXEMPLES_DEMANDE = [
  "Rénover ma salle de bain",
  "Refaire mon jardin",
  "Problème de plomberie",
  "Installation électrique",
] as const;

// Bornes legacy de la description de la demande IA (min 10 / max 2000 — alignées sur le zod backend). PUR.
export const DEMANDE_MIN = 10;
export const DEMANDE_MAX = 2000;
export function demandeValide(description: string): boolean {
  const len = description.trim().length;
  return len >= DEMANDE_MIN && len <= DEMANDE_MAX;
}

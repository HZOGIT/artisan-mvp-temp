import type { RouterOutputs } from "@/modern/shared/trpc";

// Couche DOMAIN de la feature `portail` (clean-archi) — espace client PUBLIC par token (`/v2/portail/$token`).
// SLICE 1 (socle) : vérification d'accès. Les onglets (devis/factures/paiement/interventions/chantiers/
// rdv/chat/demande IA) arrivent en slices ultérieurs. Types dérivés du routeur, 0 dépendance React/tRPC.

export type VerifyAccess = RouterOutputs["clientPortal"]["verifyAccess"];

// Onglets de l'espace client (parité legacy : ordre + valeurs). Le contenu se remplit slice par slice.
export const PORTAIL_TABS = ["demande", "devis", "factures", "interventions", "messages", "rdv", "chantier", "infos"] as const;
export type PortailTab = (typeof PORTAIL_TABS)[number];

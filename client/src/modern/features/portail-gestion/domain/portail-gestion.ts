import type { RouterOutputs } from "@/modern/shared/trpc";
import { matchSearch } from "@/lib/normalize";

// Couche DOMAINE de la feature `portail-gestion` (gestion des accès au portail client par l'artisan)
// (clean-archi) : types dérivés des sorties du routeur tRPC + règles PURES testables sans réseau ni i18n.

export type PortailClient = RouterOutputs["clients"]["list"][number];
export type PortalStatus = RouterOutputs["clientPortal"]["getStatus"];

// Recherche PURE clients (nom / prénom / email). "" → tout.
export function filterClients(clients: readonly PortailClient[], search: string): PortailClient[] {
  if (!search) return [...clients];
  return clients.filter(
    (c) => matchSearch(c.nom, search) || matchSearch(c.prenom, search) || matchSearch(c.email, search),
  );
}

export type PortalState = "actif" | "expire" | "inactif";

// État PUR de l'accès portail d'un client. `now` injectable pour des tests déterministes. Mêmes règles
// que le legacy : pas de statut → inactif ; statut + date d'expiration passée → expiré ; sinon actif.
export function portalState(status: PortalStatus | undefined, now: Date = new Date()): PortalState {
  if (!status) return "inactif";
  const expired = status.dateExpiration ? new Date(status.dateExpiration) < now : false;
  return expired ? "expire" : "actif";
}

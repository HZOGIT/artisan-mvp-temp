import type { TenantContext } from "../../../shared/tenant";
import type { Contrat, ContratStatut, CreateContratInput, UpdateContratInput } from "../domain/contrat";

// Port du repository contrats-maintenance. Chaque méthode exige le TenantContext (scope tenant +
// RLS). `contrats_maintenance` possède un `artisanId` → double cloisonnement RLS + filtre.
// `clientId` est validé via `ownsClient` (anti-IDOR-FK) ; `reference` est générée serveur via
// `nextReference`. Les transitions de statut passent par `setStatut` (use-cases dédiés), pas `update`.
export interface IContratRepository {
  list(ctx: TenantContext): Promise<Contrat[]>;
  // null si le contrat n'appartient pas au tenant.
  getById(ctx: TenantContext, id: number): Promise<Contrat | null>;
  create(ctx: TenantContext, input: CreateContratInput, reference: string): Promise<Contrat>;
  // Met à jour les métadonnées (jamais statut/reference/clientId). null si hors tenant.
  update(ctx: TenantContext, id: number, input: UpdateContratInput): Promise<Contrat | null>;
  // Applique une transition de statut. null si hors tenant.
  setStatut(ctx: TenantContext, id: number, statut: ContratStatut): Promise<Contrat | null>;
  // false si le contrat n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;
  // Le client appartient-il au tenant ? (anti-IDOR-FK)
  ownsClient(ctx: TenantContext, clientId: number): Promise<boolean>;
  // Génère la prochaine référence de contrat (serveur, scopée tenant) — jamais fournie par le client.
  nextReference(ctx: TenantContext): Promise<string>;
}

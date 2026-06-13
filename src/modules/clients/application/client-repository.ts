import type { TenantContext } from "../../../shared/tenant";
import type { Client, CreateClientInput, UpdateClientInput } from "../domain/client";

// Port du repository clients. Chaque méthode exige le TenantContext (scope tenant + RLS).
// `clients` possède un `artisanId` → double cloisonnement RLS + filtre. ⚠️ PII : aucune
// fuite cross-tenant (getById/update/delete d'un client d'un autre tenant → null/false).
// La suppression (étape ultérieure) devra préserver l'intégrité référentielle avec les
// documents liés (factures/devis/interventions).
export interface IClientRepository {
  list(ctx: TenantContext): Promise<Client[]>;
  // null si le client n'appartient pas au tenant.
  getById(ctx: TenantContext, id: number): Promise<Client | null>;
  create(ctx: TenantContext, input: CreateClientInput): Promise<Client>;
  // null si le client n'appartient pas au tenant.
  update(ctx: TenantContext, id: number, input: UpdateClientInput): Promise<Client | null>;
  // false si le client n'appartient pas au tenant.
  delete(ctx: TenantContext, id: number): Promise<boolean>;
  // Nombre de documents métier (devis/factures/interventions/chantiers/contrats) liés à ce
  // client dans le tenant. Garde d'intégrité référentielle avant suppression : on refuse de
  // supprimer un client encore référencé (évite des documents orphelins / factures cassées).
  countDocumentsLies(ctx: TenantContext, clientId: number): Promise<number>;
}

import type { TenantContext } from "../../../shared/tenant";
import type { DashClient, DashDevis, DashFacture, DashIntervention, UpcomingInterventionItem } from "../domain/dashboard";

/*
 * Port de lecture du dashboard : lots bruts scopés tenant (triés createdAt desc) + objectifs +
 * interventions à venir jointes au client. Lecture seule (RLS + filtre `artisanId`).
 */
export interface IDashboardReader {
  listFactures(ctx: TenantContext): Promise<DashFacture[]>;
  listDevis(ctx: TenantContext): Promise<DashDevis[]>;
  listClients(ctx: TenantContext): Promise<DashClient[]>;
  listInterventions(ctx: TenantContext): Promise<DashIntervention[]>;
  getObjectifs(ctx: TenantContext): Promise<{ objectifCA: string | null; objectifDevis: number | null; objectifClients: number | null }>;
  // Interventions dont dateDebut ∈ [now, now + days], triées asc, avec le client joint.
  getUpcomingInterventions(ctx: TenantContext, days: number): Promise<UpcomingInterventionItem[]>;
}

import type { TenantContext } from "../../../shared/tenant";
import type { DashClient, DashDevis, DashFacture, DashIntervention, DashboardSummaryStats, UpcomingInterventionItem } from "../domain/dashboard";

export interface ListOpts {
  limit?: number;
  since?: Date;
}

/**
 * Port de lecture du dashboard. `getSummaryStats` remplace les 4 `list*` pour les agrégats
 * (stats, objectifs, taux de conversion). Les `list*` restent pour les widgets qui ont besoin
 * de listes bornées (activité récente, CA mensuel, alertes…).
 */
export interface IDashboardReader {
  listFactures(ctx: TenantContext, opts?: ListOpts): Promise<DashFacture[]>;
  listDevis(ctx: TenantContext, opts?: ListOpts): Promise<DashDevis[]>;
  listClients(ctx: TenantContext, opts?: ListOpts): Promise<DashClient[]>;
  listInterventions(ctx: TenantContext, opts?: ListOpts): Promise<DashIntervention[]>;
  getSummaryStats(ctx: TenantContext, now?: Date): Promise<DashboardSummaryStats>;
  getObjectifs(ctx: TenantContext): Promise<{ objectifCA: string | null; objectifDevis: number | null; objectifClients: number | null }>;
  /** Interventions dont dateDebut ∈ [now, now + days], triées asc, avec le client joint. */
  getUpcomingInterventions(ctx: TenantContext, days: number): Promise<UpcomingInterventionItem[]>;
}

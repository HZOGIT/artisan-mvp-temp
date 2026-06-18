import type { TenantContext } from "../../../shared/tenant";
import {
  computeAlerts,
  computeClientEvolution,
  computeConversionRate,
  computeMonthlyCA,
  computeObjectifs,
  computeRecentActivity,
  computeStats,
  computeTopClients,
  computeYearlyComparison,
} from "../domain/dashboard";
import type {
  ClientEvolutionPoint,
  DashAlert,
  DashboardStats,
  MonthlyCAPoint,
  Objectifs,
  RecentActivityItem,
  TopClient,
  UpcomingInterventionItem,
  YearlyComparison,
} from "../domain/dashboard";
import type { IDashboardReader } from "./dashboard-reader";

// `now` injectable pour les tests ; en prod = horloge système.
type Clock = () => Date;
const FACTURE_PAYEE = "payee";

export async function getStats(reader: IDashboardReader, ctx: TenantContext, now: Clock = () => new Date()): Promise<DashboardStats> {
  const [factures, devis, clients, interventions] = await Promise.all([
    reader.listFactures(ctx),
    reader.listDevis(ctx),
    reader.listClients(ctx),
    reader.listInterventions(ctx),
  ]);
  return computeStats(factures, devis, clients.length, interventions, now());
}

export async function getRecentActivity(reader: IDashboardReader, ctx: TenantContext, limit = 10): Promise<RecentActivityItem[]> {
  const [factures, devis, clients, interventions] = await Promise.all([
    reader.listFactures(ctx),
    reader.listDevis(ctx),
    reader.listClients(ctx),
    reader.listInterventions(ctx),
  ]);
  return computeRecentActivity(devis, factures, interventions, clients, limit);
}

export function getUpcomingInterventions(reader: IDashboardReader, ctx: TenantContext): Promise<UpcomingInterventionItem[]> {
  return reader.getUpcomingInterventions(ctx, 5);
}

export async function getMonthlyCA(reader: IDashboardReader, ctx: TenantContext, months = 12, now: Clock = () => new Date()): Promise<MonthlyCAPoint[]> {
  const factures = await reader.listFactures(ctx);
  return computeMonthlyCA(factures.filter((f) => f.statut === FACTURE_PAYEE), months, now());
}

export async function getYearlyComparison(reader: IDashboardReader, ctx: TenantContext, now: Clock = () => new Date()): Promise<YearlyComparison> {
  const factures = await reader.listFactures(ctx);
  return computeYearlyComparison(factures.filter((f) => f.statut === FACTURE_PAYEE), now());
}

export async function getConversionRate(reader: IDashboardReader, ctx: TenantContext): Promise<number> {
  return computeConversionRate(await reader.listDevis(ctx));
}

export async function getTopClients(reader: IDashboardReader, ctx: TenantContext, limit = 5): Promise<TopClient[]> {
  const [factures, clients] = await Promise.all([reader.listFactures(ctx), reader.listClients(ctx)]);
  return computeTopClients(factures, clients, limit);
}

export async function getClientEvolution(reader: IDashboardReader, ctx: TenantContext, months = 12, now: Clock = () => new Date()): Promise<ClientEvolutionPoint[]> {
  return computeClientEvolution(await reader.listClients(ctx), months, now());
}

export async function getObjectifs(reader: IDashboardReader, ctx: TenantContext, now: Clock = () => new Date()): Promise<Objectifs> {
  const [objectifs, factures, devis, clients] = await Promise.all([
    reader.getObjectifs(ctx),
    reader.listFactures(ctx),
    reader.listDevis(ctx),
    reader.listClients(ctx),
  ]);
  return computeObjectifs(objectifs, factures, devis, clients, now());
}

export async function getAlerts(reader: IDashboardReader, ctx: TenantContext, now: Clock = () => new Date()): Promise<DashAlert[]> {
  const [factures, devis, upcoming] = await Promise.all([
    reader.listFactures(ctx),
    reader.listDevis(ctx),
    reader.getUpcomingInterventions(ctx, 10),
  ]);
  // computeAlerts attend des DashIntervention ; on adapte les items « upcoming » (titre + dateDebut suffisent).
  const interventions = upcoming.map((u) => ({ id: u.id, titre: u.titre, statut: u.statut, dateDebut: u.dateDebut, clientId: u.clientId, createdAt: u.dateDebut }));
  return computeAlerts(factures, devis, interventions, now());
}

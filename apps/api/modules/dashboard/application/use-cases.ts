import type { TenantContext } from "../../../shared/tenant";
import {
  computeAlerts,
  computeClientEvolution,
  computeMonthlyCA,
  computeRecentActivity,
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

type Clock = () => Date;
const FACTURE_PAYEE = "payee";
const isCALine = (f: { statut: string | null; typeDocument: string | null }) => f.statut === FACTURE_PAYEE || (f.typeDocument === "avoir" && f.statut === "validee");
const num = (v: unknown) => parseFloat(String(v ?? "0")) || 0;

/** Agrégats SQL via getSummaryStats — plus de chargement complet des 4 tables. */
export async function getStats(reader: IDashboardReader, ctx: TenantContext, now: Clock = () => new Date()): Promise<DashboardStats> {
  const s = await reader.getSummaryStats(ctx, now());
  return {
    caMonth: s.caMonth,
    caYear: s.caYear,
    devisEnCours: s.devisEnCours,
    facturesImpayees: { count: s.facturesImpayeesCount, total: s.facturesImpayeesTotal },
    totalClients: s.totalClients,
    interventionsAVenir: s.interventionsAVenir,
    totalDevis: s.totalDevis,
    totalFactures: s.totalFactures,
    totalInterventions: s.totalInterventions,
    chiffreAffaires: s.caYear,
    devisEnAttente: s.devisEnCours,
  };
}

/** Top N items récents de chaque type — LIMIT transmis à chaque list*. */
export async function getRecentActivity(reader: IDashboardReader, ctx: TenantContext, limit = 10): Promise<RecentActivityItem[]> {
  const opts = { limit };
  const [factureList, devisList, clientList, interventionList] = await Promise.all([
    reader.listFactures(ctx, opts),
    reader.listDevis(ctx, opts),
    reader.listClients(ctx, opts),
    reader.listInterventions(ctx, opts),
  ]);
  return computeRecentActivity(devisList, factureList, interventionList, clientList, limit);
}

export function getUpcomingInterventions(reader: IDashboardReader, ctx: TenantContext): Promise<UpcomingInterventionItem[]> {
  return reader.getUpcomingInterventions(ctx, 5);
}

/** CA mensuel — factures limitées à la fenêtre demandée (createdAt >= début du mois le plus ancien). */
export async function getMonthlyCA(reader: IDashboardReader, ctx: TenantContext, months = 12, now: Clock = () => new Date()): Promise<MonthlyCAPoint[]> {
  const n = now();
  const since = new Date(n.getFullYear(), n.getMonth() - months, 1);
  const factureList = await reader.listFactures(ctx, { since });
  return computeMonthlyCA(factureList.filter(isCALine), months, n);
}

/** Comparaison annuelle — factures depuis le 1er janvier de l'année précédente. */
export async function getYearlyComparison(reader: IDashboardReader, ctx: TenantContext, now: Clock = () => new Date()): Promise<YearlyComparison> {
  const n = now();
  const since = new Date(n.getFullYear() - 1, 0, 1);
  const factureList = await reader.listFactures(ctx, { since });
  return computeYearlyComparison(factureList.filter(isCALine), n);
}

/** Taux de conversion — agrégat SQL via getSummaryStats. */
export async function getConversionRate(reader: IDashboardReader, ctx: TenantContext): Promise<number> {
  const s = await reader.getSummaryStats(ctx);
  if (s.totalDevis === 0) return 0;
  return Math.round((s.devisAcceptes / s.totalDevis) * 100);
}

/** Top clients — factures des 12 derniers mois (CA récent). */
export async function getTopClients(reader: IDashboardReader, ctx: TenantContext, limit = 5, now: Clock = () => new Date()): Promise<TopClient[]> {
  const n = now();
  const since = new Date(n.getFullYear() - 1, n.getMonth(), 1);
  const [factureList, clientList] = await Promise.all([
    reader.listFactures(ctx, { since }),
    reader.listClients(ctx),
  ]);
  return computeTopClients(factureList, clientList, limit);
}

export async function getClientEvolution(reader: IDashboardReader, ctx: TenantContext, months = 12, now: Clock = () => new Date()): Promise<ClientEvolutionPoint[]> {
  return computeClientEvolution(await reader.listClients(ctx), months, now());
}

/** Objectifs — agrégat SQL via getSummaryStats. */
export async function getObjectifs(reader: IDashboardReader, ctx: TenantContext, now: Clock = () => new Date()): Promise<Objectifs> {
  const [objectifsRow, summary] = await Promise.all([
    reader.getObjectifs(ctx),
    reader.getSummaryStats(ctx, now()),
  ]);
  return {
    objectifCA: num(objectifsRow.objectifCA),
    currentCA: summary.caMonth,
    objectifDevis: objectifsRow.objectifDevis ?? 0,
    currentDevis: summary.devisThisMonth,
    objectifClients: objectifsRow.objectifClients ?? 0,
    currentClients: summary.clientsThisMonth,
  };
}

/** Alertes — factures des 90 derniers jours (couvre les retards > 30j), devis des 30 derniers jours. */
export async function getAlerts(reader: IDashboardReader, ctx: TenantContext, now: Clock = () => new Date()): Promise<DashAlert[]> {
  const n = now();
  const since90 = new Date(n.getTime() - 90 * 86400000);
  const since30 = new Date(n.getTime() - 30 * 86400000);
  const [factureList, devisList, upcoming] = await Promise.all([
    reader.listFactures(ctx, { since: since90 }),
    reader.listDevis(ctx, { since: since30 }),
    reader.getUpcomingInterventions(ctx, 10),
  ]);
  const interventions = upcoming.map((u) => ({ id: u.id, titre: u.titre, statut: u.statut, dateDebut: u.dateDebut, clientId: u.clientId, createdAt: u.dateDebut }));
  return computeAlerts(factureList, devisList, interventions, n);
}

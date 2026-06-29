import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { clients, devis, factures, interventions, parametresArtisan } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IDashboardReader, ListOpts } from "../application/dashboard-reader";
import type { DashClient, DashDevis, DashFacture, DashIntervention, DashboardSummaryStats, UpcomingInterventionItem } from "../domain/dashboard";

const toNum = (v: unknown) => parseFloat(String(v ?? "0")) || 0;

/**
 * Lecteur Drizzle du dashboard : agrégats SQL scopés tenant (RLS via withTenant + filtre explicite
 * `artisanId`). `getSummaryStats` remplace les 4 chargements complets (COUNT/SUM en PG, pas en JS).
 */
export class DashboardReaderDrizzle implements IDashboardReader {
  constructor(private readonly db: DbClient) {}

  getSummaryStats(ctx: TenantContext, now = new Date()): Promise<DashboardSummaryStats> {
    return withTenant(this.db, ctx, async (tx) => {
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      type FRow = { ca_month: string; ca_year: string; total_factures: number; impayees_count: number; impayees_total: string };
      type DRow = { total_devis: number; devis_en_cours: number; devis_acceptes: number; devis_this_month: number };
      type CRow = { total_clients: number; clients_this_month: number };
      type IRow = { total_interventions: number; interventions_a_venir: number };

      const [fRow] = (await tx.execute<FRow>(sql`
        SELECT
          COALESCE(SUM(CASE WHEN (statut = 'payee' OR ("typeDocument" = 'avoir' AND statut = 'validee'))
            AND EXTRACT(YEAR FROM COALESCE("datePaiement", "createdAt")) = ${year}
            AND EXTRACT(MONTH FROM COALESCE("datePaiement", "createdAt")) = ${month}
            THEN "totalHT"::numeric ELSE 0 END), 0) AS ca_month,
          COALESCE(SUM(CASE WHEN (statut = 'payee' OR ("typeDocument" = 'avoir' AND statut = 'validee'))
            AND EXTRACT(YEAR FROM COALESCE("datePaiement", "createdAt")) = ${year}
            THEN "totalHT"::numeric ELSE 0 END), 0) AS ca_year,
          COUNT(*)::int AS total_factures,
          COUNT(CASE WHEN statut NOT IN ('payee','annulee','brouillon')
            AND "typeDocument" IS DISTINCT FROM 'avoir' THEN 1 END)::int AS impayees_count,
          COALESCE(SUM(CASE WHEN statut NOT IN ('payee','annulee','brouillon')
            AND "typeDocument" IS DISTINCT FROM 'avoir'
            THEN "totalTTC"::numeric ELSE 0 END), 0) AS impayees_total
        FROM factures WHERE "artisanId" = ${ctx.artisanId}
      `)).rows;

      const [dRow] = (await tx.execute<DRow>(sql`
        SELECT
          COUNT(*)::int AS total_devis,
          COUNT(CASE WHEN statut IN ('brouillon','envoye') THEN 1 END)::int AS devis_en_cours,
          COUNT(CASE WHEN statut = 'accepte' THEN 1 END)::int AS devis_acceptes,
          COUNT(CASE WHEN EXTRACT(YEAR FROM "createdAt") = ${year}
            AND EXTRACT(MONTH FROM "createdAt") = ${month} THEN 1 END)::int AS devis_this_month
        FROM devis WHERE "artisanId" = ${ctx.artisanId}
      `)).rows;

      const [cRow] = (await tx.execute<CRow>(sql`
        SELECT
          COUNT(*)::int AS total_clients,
          COUNT(CASE WHEN EXTRACT(YEAR FROM "createdAt") = ${year}
            AND EXTRACT(MONTH FROM "createdAt") = ${month} THEN 1 END)::int AS clients_this_month
        FROM clients WHERE "artisanId" = ${ctx.artisanId}
      `)).rows;

      const [iRow] = (await tx.execute<IRow>(sql`
        SELECT
          COUNT(*)::int AS total_interventions,
          COUNT(CASE WHEN statut = 'planifiee' AND "dateDebut" >= ${now} THEN 1 END)::int AS interventions_a_venir
        FROM interventions WHERE "artisanId" = ${ctx.artisanId}
      `)).rows;

      return {
        caMonth: toNum(fRow.ca_month),
        caYear: toNum(fRow.ca_year),
        facturesImpayeesCount: fRow.impayees_count ?? 0,
        facturesImpayeesTotal: toNum(fRow.impayees_total),
        devisEnCours: dRow.devis_en_cours ?? 0,
        devisAcceptes: dRow.devis_acceptes ?? 0,
        devisThisMonth: dRow.devis_this_month ?? 0,
        totalClients: cRow.total_clients ?? 0,
        clientsThisMonth: cRow.clients_this_month ?? 0,
        totalDevis: dRow.total_devis ?? 0,
        totalFactures: fRow.total_factures ?? 0,
        totalInterventions: iRow.total_interventions ?? 0,
        interventionsAVenir: iRow.interventions_a_venir ?? 0,
      };
    });
  }

  listFactures(ctx: TenantContext, opts?: ListOpts): Promise<DashFacture[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const cond = opts?.since
        ? and(eq(factures.artisanId, ctx.artisanId), gte(factures.createdAt, opts.since))
        : eq(factures.artisanId, ctx.artisanId);
      let q = tx
        .select({ id: factures.id, numero: factures.numero, clientId: factures.clientId, statut: factures.statut, totalHT: factures.totalHT, totalTTC: factures.totalTTC, typeDocument: factures.typeDocument, dateFacture: factures.dateFacture, datePaiement: factures.datePaiement, createdAt: factures.createdAt })
        .from(factures)
        .where(cond)
        .orderBy(desc(factures.createdAt), desc(factures.id))
        .$dynamic();
      if (opts?.limit) q = q.limit(opts.limit);
      const rows = await q;
      return rows.map((r) => ({ ...r, statut: r.statut ?? null, totalHT: r.totalHT ?? null, totalTTC: r.totalTTC ?? null, typeDocument: r.typeDocument ?? null, datePaiement: r.datePaiement ?? null }));
    });
  }

  listDevis(ctx: TenantContext, opts?: ListOpts): Promise<DashDevis[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const cond = opts?.since
        ? and(eq(devis.artisanId, ctx.artisanId), gte(devis.createdAt, opts.since))
        : eq(devis.artisanId, ctx.artisanId);
      let q = tx
        .select({ id: devis.id, numero: devis.numero, statut: devis.statut, createdAt: devis.createdAt })
        .from(devis)
        .where(cond)
        .orderBy(desc(devis.createdAt), desc(devis.id))
        .$dynamic();
      if (opts?.limit) q = q.limit(opts.limit);
      const rows = await q;
      return rows.map((r) => ({ ...r, statut: r.statut ?? null }));
    });
  }

  listClients(ctx: TenantContext, opts?: ListOpts): Promise<DashClient[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const cond = opts?.since
        ? and(eq(clients.artisanId, ctx.artisanId), gte(clients.createdAt, opts.since))
        : eq(clients.artisanId, ctx.artisanId);
      let q = tx
        .select({ id: clients.id, nom: clients.nom, prenom: clients.prenom, createdAt: clients.createdAt })
        .from(clients)
        .where(cond)
        .orderBy(desc(clients.createdAt), desc(clients.id))
        .$dynamic();
      if (opts?.limit) q = q.limit(opts.limit);
      const rows = await q;
      return rows.map((r) => ({ ...r, prenom: r.prenom ?? null }));
    });
  }

  listInterventions(ctx: TenantContext, opts?: ListOpts): Promise<DashIntervention[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const cond = opts?.since
        ? and(eq(interventions.artisanId, ctx.artisanId), gte(interventions.createdAt, opts.since))
        : eq(interventions.artisanId, ctx.artisanId);
      let q = tx
        .select({ id: interventions.id, titre: interventions.titre, statut: interventions.statut, dateDebut: interventions.dateDebut, clientId: interventions.clientId, createdAt: interventions.createdAt })
        .from(interventions)
        .where(cond)
        .orderBy(desc(interventions.createdAt), desc(interventions.id))
        .$dynamic();
      if (opts?.limit) q = q.limit(opts.limit);
      const rows = await q;
      return rows.map((r) => ({ ...r, statut: r.statut ?? null }));
    });
  }

  getObjectifs(ctx: TenantContext): Promise<{ objectifCA: string | null; objectifDevis: number | null; objectifClients: number | null }> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ objectifCA: parametresArtisan.objectifCA, objectifDevis: parametresArtisan.objectifDevis, objectifClients: parametresArtisan.objectifClients })
        .from(parametresArtisan)
        .where(eq(parametresArtisan.artisanId, ctx.artisanId))
        .limit(1);
      return row ?? { objectifCA: null, objectifDevis: null, objectifClients: null };
    });
  }

  getUpcomingInterventions(ctx: TenantContext, days: number): Promise<UpcomingInterventionItem[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const now = new Date();
      const future = new Date();
      future.setDate(future.getDate() + days);
      const rows = await tx
        .select({ id: interventions.id, titre: interventions.titre, statut: interventions.statut, dateDebut: interventions.dateDebut, adresse: interventions.adresse, clientId: interventions.clientId })
        .from(interventions)
        .where(and(eq(interventions.artisanId, ctx.artisanId), gte(interventions.dateDebut, now), lte(interventions.dateDebut, future)))
        .orderBy(asc(interventions.dateDebut));
      if (rows.length === 0) return [];
      const clientIds = Array.from(new Set(rows.map((r) => r.clientId)));
      const clientRows = await tx
        .select({ id: clients.id, nom: clients.nom, prenom: clients.prenom })
        .from(clients)
        .where(and(eq(clients.artisanId, ctx.artisanId), inArray(clients.id, clientIds)));
      const byId = new Map(clientRows.map((c) => [c.id, { id: c.id, nom: c.nom, prenom: c.prenom ?? null }]));
      return rows.map((r) => ({ id: r.id, titre: r.titre, dateDebut: r.dateDebut, statut: r.statut ?? null, adresse: r.adresse ?? null, clientId: r.clientId, client: byId.get(r.clientId) ?? null }));
    });
  }
}

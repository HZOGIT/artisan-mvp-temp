import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { clients, devis, factures, interventions, parametresArtisan } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IDashboardReader } from "../application/dashboard-reader";
import type { DashClient, DashDevis, DashFacture, DashIntervention, UpcomingInterventionItem } from "../domain/dashboard";

/*
 * Lecteur Drizzle du dashboard : lots bruts scopés tenant (RLS via withTenant + filtre explicite
 * `artisanId`). Lecture seule. Les agrégations sont faites par les fonctions pures du domaine.
 */
export class DashboardReaderDrizzle implements IDashboardReader {
  constructor(private readonly db: DbClient) {}

  listFactures(ctx: TenantContext): Promise<DashFacture[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select({ id: factures.id, numero: factures.numero, clientId: factures.clientId, statut: factures.statut, totalTTC: factures.totalTTC, dateFacture: factures.dateFacture, datePaiement: factures.datePaiement, createdAt: factures.createdAt })
        .from(factures)
        .where(eq(factures.artisanId, ctx.artisanId))
        .orderBy(desc(factures.createdAt), desc(factures.id));
      return rows.map((r) => ({ ...r, statut: r.statut ?? null, totalTTC: r.totalTTC ?? null, datePaiement: r.datePaiement ?? null }));
    });
  }

  listDevis(ctx: TenantContext): Promise<DashDevis[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select({ id: devis.id, numero: devis.numero, statut: devis.statut, createdAt: devis.createdAt })
        .from(devis)
        .where(eq(devis.artisanId, ctx.artisanId))
        .orderBy(desc(devis.createdAt), desc(devis.id));
      return rows.map((r) => ({ ...r, statut: r.statut ?? null }));
    });
  }

  listClients(ctx: TenantContext): Promise<DashClient[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select({ id: clients.id, nom: clients.nom, prenom: clients.prenom, createdAt: clients.createdAt })
        .from(clients)
        .where(eq(clients.artisanId, ctx.artisanId))
        .orderBy(desc(clients.createdAt), desc(clients.id));
      return rows.map((r) => ({ ...r, prenom: r.prenom ?? null }));
    });
  }

  listInterventions(ctx: TenantContext): Promise<DashIntervention[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select({ id: interventions.id, titre: interventions.titre, statut: interventions.statut, dateDebut: interventions.dateDebut, clientId: interventions.clientId, createdAt: interventions.createdAt })
        .from(interventions)
        .where(eq(interventions.artisanId, ctx.artisanId))
        .orderBy(desc(interventions.createdAt), desc(interventions.id));
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

import { and, asc, desc, eq, inArray, notExists, sql } from "drizzle-orm";
import { configurationsComptables, exportsComptables, factures, clients } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { CreateExportData, IIntegrationsComptablesRepository, PendingItem, UpdateExportData } from "../application/integrations-comptables-repository";
import type { ConfigComptable, ExportComptableRow, FactureIIF, SaveConfigInput, SaveSyncConfigInput } from "../domain/integration-comptable";

type ConfigRow = typeof configurationsComptables.$inferSelect;
type ExportRow = typeof exportsComptables.$inferSelect;

function toConfig(r: ConfigRow): ConfigComptable {
  return {
    logiciel: r.logiciel ?? null, formatExport: r.formatExport ?? null, compteVentes: r.compteVentes ?? null, compteTVACollectee: r.compteTVACollectee ?? null,
    compteClients: r.compteClients ?? null, compteAchats: r.compteAchats ?? null, compteTVADeductible: r.compteTVADeductible ?? null, compteFournisseurs: r.compteFournisseurs ?? null,
    compteBanque: r.compteBanque ?? null, compteCaisse: r.compteCaisse ?? null, journalVentes: r.journalVentes ?? null, journalAchats: r.journalAchats ?? null, journalBanque: r.journalBanque ?? null,
    prefixeFacture: r.prefixeFacture ?? null, prefixeAvoir: r.prefixeAvoir ?? null, exerciceDebut: r.exerciceDebut ?? null, actif: r.actif ?? null,
    syncAutoFactures: r.syncAutoFactures ?? null, syncAutoPaiements: r.syncAutoPaiements ?? null, frequenceSync: r.frequenceSync ?? null, heureSync: r.heureSync ?? null,
    notifierErreurs: r.notifierErreurs ?? null, notifierSucces: r.notifierSucces ?? null, regimeTVA: r.regimeTVA ?? null,
    dateVerrouillageCompta: r.dateVerrouillageCompta ?? null, derniereSync: r.derniereSync ?? null, prochainSync: r.prochainSync ?? null,
  };
}

function toExport(r: ExportRow): ExportComptableRow {
  return { id: r.id, logiciel: r.logiciel ?? null, formatExport: r.formatExport ?? null, periodeDebut: r.periodeDebut ?? null, periodeFin: r.periodeFin ?? null, nombreEcritures: r.nombreEcritures ?? null, montantTotal: r.montantTotal ?? null, statut: r.statut ?? null, erreur: r.erreur ?? null, createdAt: r.createdAt };
}

/** Colonnes whitelistées à l'upsert config (defense-in-depth, parité audit injection SQL legacy). */
const CONFIG_COLS = new Set<string>([
  "logiciel", "formatExport", "compteVentes", "compteTVACollectee", "compteClients", "compteAchats", "compteTVADeductible", "compteFournisseurs", "compteBanque", "compteCaisse",
  "journalVentes", "journalAchats", "journalBanque", "prefixeFacture", "prefixeAvoir", "exerciceDebut", "actif", "syncAutoFactures", "syncAutoPaiements", "frequenceSync", "heureSync", "notifierErreurs", "notifierSucces",
  "regimeTVA",
]);

/*
 * Repository Drizzle des intégrations comptables. Tables SOUS RLS (artisanId via withTenant). Lecture
 * seule des factures pour l'IIF (jamais d'altération d'écriture). Une config par artisan (upsert).
 */
export class IntegrationsComptablesRepositoryDrizzle implements IIntegrationsComptablesRepository {
  constructor(private readonly db: DbClient) {}

  getConfig(ctx: TenantContext): Promise<ConfigComptable | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [r] = await tx.select().from(configurationsComptables).where(eq(configurationsComptables.artisanId, ctx.artisanId)).limit(1);
      return r ? toConfig(r) : null;
    });
  }

  saveConfig(ctx: TenantContext, patch: SaveConfigInput | SaveSyncConfigInput): Promise<ConfigComptable | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const filtered: Record<string, unknown> = {};
      for (const k of Object.keys(patch)) if (CONFIG_COLS.has(k) && (patch as Record<string, unknown>)[k] !== undefined) filtered[k] = (patch as Record<string, unknown>)[k];
      const [existing] = await tx.select({ id: configurationsComptables.id }).from(configurationsComptables).where(eq(configurationsComptables.artisanId, ctx.artisanId)).limit(1);
      if (existing) {
        if (Object.keys(filtered).length > 0) await tx.update(configurationsComptables).set(filtered).where(eq(configurationsComptables.artisanId, ctx.artisanId));
      } else {
        await tx.insert(configurationsComptables).values({ artisanId: ctx.artisanId, ...filtered });
      }
      const [r] = await tx.select().from(configurationsComptables).where(eq(configurationsComptables.artisanId, ctx.artisanId)).limit(1);
      return r ? toConfig(r) : null;
    });
  }

  listExports(ctx: TenantContext): Promise<ExportComptableRow[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx.select().from(exportsComptables).where(eq(exportsComptables.artisanId, ctx.artisanId)).orderBy(desc(exportsComptables.createdAt));
      return rows.map(toExport);
    });
  }

  createExport(ctx: TenantContext, data: CreateExportData): Promise<ExportComptableRow> {
    return withTenant(this.db, ctx, async (tx) => {
      const [r] = await tx
        .insert(exportsComptables)
        .values({ artisanId: ctx.artisanId, logiciel: data.logiciel as never, formatExport: data.formatExport as never, periodeDebut: data.periodeDebut, periodeFin: data.periodeFin, nombreEcritures: data.nombreEcritures ?? 0, statut: (data.statut ?? "en_cours") as never })
        .returning();
      return toExport(r);
    });
  }

  async updateExport(ctx: TenantContext, exportId: number, data: UpdateExportData): Promise<void> {
    await withTenant(this.db, ctx, async (tx) => {
      const patch: Record<string, unknown> = {};
      if (data.statut !== undefined) patch.statut = data.statut;
      if (data.nombreEcritures !== undefined) patch.nombreEcritures = data.nombreEcritures;
      if (data.erreur !== undefined) patch.erreur = data.erreur;
      if (Object.keys(patch).length > 0) await tx.update(exportsComptables).set(patch).where(and(eq(exportsComptables.id, exportId), eq(exportsComptables.artisanId, ctx.artisanId)));
    });
  }

  listFacturesForIIF(ctx: TenantContext, dateDebut: Date, dateFin: Date): Promise<FactureIIF[]> {
    const dStr = dateDebut.toISOString().slice(0, 10);
    const fStr = dateFin.toISOString().slice(0, 10);
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select({ id: factures.id, numero: factures.numero, dateFacture: factures.dateFacture, totalHT: factures.totalHT, totalTVA: factures.totalTVA, totalTTC: factures.totalTTC, clientNom: clients.nom, clientPrenom: clients.prenom })
        .from(factures)
        .leftJoin(clients, eq(clients.id, factures.clientId))
        .where(and(eq(factures.artisanId, ctx.artisanId), sql`${factures.dateFacture} BETWEEN ${dStr} AND ${fStr}`, inArray(factures.statut, ["validee", "envoyee", "payee", "en_retard"])))
        .orderBy(asc(factures.dateFacture));
      return rows.map((f) => ({ id: f.id, numero: f.numero ?? null, dateFacture: f.dateFacture, totalHT: f.totalHT ?? null, totalTVA: f.totalTVA ?? null, totalTTC: f.totalTTC ?? null, clientNom: f.clientNom ?? null, clientPrenom: f.clientPrenom ?? null }));
    });
  }

  listSyncLogs(ctx: TenantContext): Promise<ExportComptableRow[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx.select().from(exportsComptables).where(eq(exportsComptables.artisanId, ctx.artisanId)).orderBy(desc(exportsComptables.createdAt)).limit(50);
      return rows.map(toExport);
    });
  }

  listPendingItems(ctx: TenantContext): Promise<PendingItem[]> {
    return withTenant(this.db, ctx, async (tx) => {
      /** Factures à statut « émis » NON couvertes par un export `termine` chevauchant leur date. */
      const rows = await tx
        .select({ id: factures.id, numero: factures.numero, dateFacture: factures.dateFacture, totalTTC: factures.totalTTC, statut: factures.statut })
        .from(factures)
        .where(
          and(
            eq(factures.artisanId, ctx.artisanId),
            inArray(factures.statut, ["validee", "envoyee", "payee", "en_retard"]),
            notExists(
              tx
                .select({ x: sql`1` })
                .from(exportsComptables)
                .where(and(eq(exportsComptables.artisanId, factures.artisanId), eq(exportsComptables.statut, "termine"), sql`${factures.dateFacture} BETWEEN ${exportsComptables.periodeDebut} AND ${exportsComptables.periodeFin}`)),
            ),
          ),
        )
        .orderBy(desc(factures.dateFacture))
        .limit(200);
      return rows.map((f) => ({ id: f.id, numero: f.numero ?? null, dateFacture: f.dateFacture, totalTTC: f.totalTTC ?? null, statut: f.statut ?? null }));
    });
  }

  async touchDerniereSync(ctx: TenantContext, now: Date): Promise<void> {
    await withTenant(this.db, ctx, async (tx) => {
      await tx.update(configurationsComptables).set({ derniereSync: now }).where(eq(configurationsComptables.artisanId, ctx.artisanId));
    });
  }

  async getLockDate(ctx: TenantContext): Promise<string | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [r] = await tx.select({ dateVerrouillageCompta: configurationsComptables.dateVerrouillageCompta }).from(configurationsComptables).where(eq(configurationsComptables.artisanId, ctx.artisanId)).limit(1);
      return r?.dateVerrouillageCompta ?? null;
    });
  }

  async setLockDate(ctx: TenantContext, date: string | null): Promise<void> {
    await withTenant(this.db, ctx, async (tx) => {
      const [existing] = await tx.select({ id: configurationsComptables.id }).from(configurationsComptables).where(eq(configurationsComptables.artisanId, ctx.artisanId)).limit(1);
      if (existing) {
        await tx.update(configurationsComptables).set({ dateVerrouillageCompta: date }).where(eq(configurationsComptables.artisanId, ctx.artisanId));
      } else {
        await tx.insert(configurationsComptables).values({ artisanId: ctx.artisanId, dateVerrouillageCompta: date });
      }
    });
  }
}

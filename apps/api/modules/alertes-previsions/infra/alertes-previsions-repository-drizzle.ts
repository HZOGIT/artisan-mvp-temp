import { and, desc, eq, sql } from "drizzle-orm";
import { configAlertesPrevisions, historiqueAlertesPrevisions, previsionsCA, factures } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IAlertesPrevisionsRepository, InsertHistoriqueData } from "../application/alertes-previsions-repository";
import type { AlerteConfig, AlerteHistorique, AlerteType, SaveAlerteConfigInput } from "../domain/alerte-prevision";

type ConfigRow = typeof configAlertesPrevisions.$inferSelect;
type HistoRow = typeof historiqueAlertesPrevisions.$inferSelect;

function toConfig(r: ConfigRow): AlerteConfig {
  return {
    seuilAlertePositif: r.seuilAlertePositif ?? null,
    seuilAlerteNegatif: r.seuilAlerteNegatif ?? null,
    alerteEmail: r.alerteEmail ?? null,
    alerteSms: r.alerteSms ?? null,
    emailDestination: r.emailDestination ?? null,
    telephoneDestination: r.telephoneDestination ?? null,
    frequenceVerification: r.frequenceVerification ?? null,
    actif: r.actif ?? null,
  };
}

function toHistorique(r: HistoRow): AlerteHistorique {
  return {
    id: r.id,
    mois: r.mois,
    annee: r.annee,
    typeAlerte: r.typeAlerte,
    caPrevisionnel: r.caPrevisionnel ?? null,
    caRealise: r.caRealise ?? null,
    ecartPourcentage: r.ecartPourcentage ?? null,
    canalEnvoi: r.canalEnvoi,
    dateEnvoi: r.dateEnvoi,
    statut: r.statut ?? null,
    message: r.message ?? null,
  };
}

// Colonnes autorisées à l'upsert (whitelist, defense-in-depth — parité audit injection SQL legacy).
const CONFIG_COLS = new Set<keyof SaveAlerteConfigInput>([
  "seuilAlertePositif", "seuilAlerteNegatif", "alerteEmail", "alerteSms",
  "emailDestination", "telephoneDestination", "frequenceVerification", "actif",
]);

/*
 * Repository Drizzle alertes-prévisions. Tables SOUS RLS (artisanId via `app.tenant`) → toutes les
 * requêtes passent par `withTenant` (double cloisonnement RLS + filtre explicite `artisanId`).
 */
export class AlertesPrevisionsRepositoryDrizzle implements IAlertesPrevisionsRepository {
  constructor(private readonly db: DbClient) {}

  getConfig(ctx: TenantContext): Promise<AlerteConfig | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx.select().from(configAlertesPrevisions).where(eq(configAlertesPrevisions.artisanId, ctx.artisanId)).limit(1);
      return row ? toConfig(row) : null;
    });
  }

  upsertConfig(ctx: TenantContext, patch: SaveAlerteConfigInput): Promise<AlerteConfig | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const filtered: Record<string, unknown> = {};
      for (const k of Object.keys(patch) as (keyof SaveAlerteConfigInput)[]) {
        if (CONFIG_COLS.has(k) && patch[k] !== undefined) filtered[k] = patch[k];
      }
      const [existing] = await tx.select({ id: configAlertesPrevisions.id }).from(configAlertesPrevisions).where(eq(configAlertesPrevisions.artisanId, ctx.artisanId)).limit(1);
      if (existing) {
        if (Object.keys(filtered).length > 0) {
          await tx.update(configAlertesPrevisions).set(filtered).where(eq(configAlertesPrevisions.artisanId, ctx.artisanId));
        }
      } else {
        await tx.insert(configAlertesPrevisions).values({ artisanId: ctx.artisanId, ...filtered });
      }
      const [row] = await tx.select().from(configAlertesPrevisions).where(eq(configAlertesPrevisions.artisanId, ctx.artisanId)).limit(1);
      return row ? toConfig(row) : null;
    });
  }

  listHistorique(ctx: TenantContext): Promise<AlerteHistorique[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(historiqueAlertesPrevisions)
        .where(eq(historiqueAlertesPrevisions.artisanId, ctx.artisanId))
        .orderBy(desc(historiqueAlertesPrevisions.dateEnvoi))
        .limit(100);
      return rows.map(toHistorique);
    });
  }

  getPrevisionCA(ctx: TenantContext, mois: number, annee: number): Promise<number | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ ca: previsionsCA.caPrevisionnel })
        .from(previsionsCA)
        .where(and(eq(previsionsCA.artisanId, ctx.artisanId), eq(previsionsCA.mois, mois), eq(previsionsCA.annee, annee)))
        .limit(1);
      return row ? Number(row.ca ?? 0) : null;
    });
  }

  getCaRealiseMois(ctx: TenantContext, mois: number, annee: number): Promise<number> {
    const debut = new Date(annee, mois - 1, 1).toISOString().slice(0, 10);
    const fin = new Date(annee, mois, 0).toISOString().slice(0, 10);
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ ca: sql<string>`COALESCE(SUM(${factures.totalTTC}), 0)` })
        .from(factures)
        .where(and(eq(factures.artisanId, ctx.artisanId), eq(factures.statut, "payee"), sql`${factures.dateFacture} BETWEEN ${debut} AND ${fin}`));
      return Number(row?.ca ?? 0);
    });
  }

  historiqueExiste(ctx: TenantContext, mois: number, annee: number, typeAlerte: AlerteType): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ id: historiqueAlertesPrevisions.id })
        .from(historiqueAlertesPrevisions)
        .where(and(eq(historiqueAlertesPrevisions.artisanId, ctx.artisanId), eq(historiqueAlertesPrevisions.mois, mois), eq(historiqueAlertesPrevisions.annee, annee), eq(historiqueAlertesPrevisions.typeAlerte, typeAlerte)))
        .limit(1);
      return Boolean(row);
    });
  }

  insertHistorique(ctx: TenantContext, data: InsertHistoriqueData): Promise<AlerteHistorique> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(historiqueAlertesPrevisions)
        .values({
          artisanId: ctx.artisanId,
          mois: data.mois,
          annee: data.annee,
          typeAlerte: data.typeAlerte,
          caPrevisionnel: data.caPrevisionnel,
          caRealise: data.caRealise,
          ecartPourcentage: data.ecartPourcentage,
          canalEnvoi: data.canalEnvoi,
          statut: data.statut,
          message: data.message,
        })
        .returning();
      return toHistorique(row);
    });
  }
}

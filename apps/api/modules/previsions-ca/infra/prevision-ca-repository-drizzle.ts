import { and, desc, eq } from "drizzle-orm";
import { previsionsCA, historiqueCA } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IPrevisionCARepository } from "../application/prevision-ca-repository";
import type {
  CreatePrevisionInput,
  PrevisionCA,
  PrevisionMethode,
  UpdatePrevisionInput,
  HistoriqueCA,
  UpsertHistoriqueInput,
  UpsertPrevisionInput,
} from "../domain/prevision-ca";

type PrevisionRow = typeof previsionsCA.$inferSelect;
type PrevisionInsert = typeof previsionsCA.$inferInsert;
type HistoriqueRow = typeof historiqueCA.$inferSelect;

function toHistorique(r: HistoriqueRow): HistoriqueCA {
  return {
    id: r.id,
    artisanId: r.artisanId,
    mois: r.mois,
    annee: r.annee,
    caTotal: r.caTotal ?? "0.00",
    nombreFactures: r.nombreFactures ?? 0,
    nombreClients: r.nombreClients ?? 0,
    panierMoyen: r.panierMoyen ?? "0.00",
    tauxConversion: r.tauxConversion ?? null,
    createdAt: r.createdAt,
  };
}

/** Traduit une ligne PG (colonnes camelCase, pas de snake_case) → domaine. Défauts montants "0.00". */
function toPrevision(r: PrevisionRow): PrevisionCA {
  return {
    id: r.id,
    artisanId: r.artisanId,
    mois: r.mois,
    annee: r.annee,
    caPrevisionnel: r.caPrevisionnel ?? "0.00",
    caRealise: r.caRealise ?? "0.00",
    ecart: r.ecart ?? "0.00",
    ecartPourcentage: r.ecartPourcentage ?? "0.00",
    methodeCalcul: (r.methodeCalcul ?? "moyenne_mobile") as PrevisionMethode,
    confiance: r.confiance ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/*
 * Mappe les champs camelCase de l'input vers les colonnes (seuls les champs fournis). ⚠️ Jamais
 * mois/annee (période immuable = identité de la prévision).
 */
function toSet(input: UpdatePrevisionInput): Partial<PrevisionInsert> {
  const set: Partial<PrevisionInsert> = {};
  if (input.caPrevisionnel !== undefined) set.caPrevisionnel = input.caPrevisionnel;
  if (input.caRealise !== undefined) set.caRealise = input.caRealise;
  if (input.ecart !== undefined) set.ecart = input.ecart;
  if (input.ecartPourcentage !== undefined) set.ecartPourcentage = input.ecartPourcentage;
  if (input.methodeCalcul !== undefined) set.methodeCalcul = input.methodeCalcul;
  if (input.confiance !== undefined) set.confiance = input.confiance;
  return set;
}

/*
 * Implémentation Drizzle du repository previsions-ca. Double cloisonnement RLS + filtre `artisanId`
 * sur `previsions_ca`. `artisanId` forcé à la création. Colonnes camelCase (pas de snake_case). Pas de
 * contrainte d'unicité. L'update ne touche que les montants/méthode/confiance (mois/annee immuables).
 */
export class PrevisionCARepositoryDrizzle implements IPrevisionCARepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<PrevisionCA[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(previsionsCA)
        .where(eq(previsionsCA.artisanId, ctx.artisanId))
        .orderBy(desc(previsionsCA.annee), desc(previsionsCA.mois), desc(previsionsCA.id));
      return rows.map(toPrevision);
    });
  }

  listByAnnee(ctx: TenantContext, annee: number): Promise<PrevisionCA[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(previsionsCA)
        .where(and(eq(previsionsCA.artisanId, ctx.artisanId), eq(previsionsCA.annee, annee)))
        .orderBy(desc(previsionsCA.mois), desc(previsionsCA.id));
      return rows.map(toPrevision);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<PrevisionCA | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(previsionsCA)
        .where(and(eq(previsionsCA.id, id), eq(previsionsCA.artisanId, ctx.artisanId)))
        .limit(1);
      return row ? toPrevision(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreatePrevisionInput): Promise<PrevisionCA> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(previsionsCA)
        .values({
          /** forcé */
          artisanId: ctx.artisanId,
          mois: input.mois,
          annee: input.annee,
          caPrevisionnel: input.caPrevisionnel ?? undefined,
          caRealise: input.caRealise ?? undefined,
          ecart: input.ecart ?? undefined,
          ecartPourcentage: input.ecartPourcentage ?? undefined,
          methodeCalcul: input.methodeCalcul ?? undefined,
          confiance: input.confiance ?? undefined,
        })
        .returning();
      return toPrevision(row);
    });
  }

  update(ctx: TenantContext, id: number, input: UpdatePrevisionInput): Promise<PrevisionCA | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const set = toSet(input);
      if (Object.keys(set).length === 0) {
        const [row] = await tx
          .select()
          .from(previsionsCA)
          .where(and(eq(previsionsCA.id, id), eq(previsionsCA.artisanId, ctx.artisanId)))
          .limit(1);
        return row ? toPrevision(row) : null;
      }
      const [row] = await tx
        .update(previsionsCA)
        .set(set)
        .where(and(eq(previsionsCA.id, id), eq(previsionsCA.artisanId, ctx.artisanId)))
        .returning();
      return row ? toPrevision(row) : null;
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const deleted = await tx
        .delete(previsionsCA)
        .where(and(eq(previsionsCA.id, id), eq(previsionsCA.artisanId, ctx.artisanId)))
        .returning({ id: previsionsCA.id });
      return deleted.length > 0;
    });
  }

  listHistorique(ctx: TenantContext, nombreMois: number): Promise<HistoriqueCA[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(historiqueCA)
        .where(eq(historiqueCA.artisanId, ctx.artisanId))
        .orderBy(desc(historiqueCA.annee), desc(historiqueCA.mois))
        .limit(nombreMois);
      return rows.map(toHistorique);
    });
  }

  listHistoriqueAnnee(ctx: TenantContext, annee: number): Promise<HistoriqueCA[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(historiqueCA)
        .where(and(eq(historiqueCA.artisanId, ctx.artisanId), eq(historiqueCA.annee, annee)));
      return rows.map(toHistorique);
    });
  }

  /** Upsert = delete (artisan,mois,annee) puis insert (artisanId forcé) — parité legacy. */
  upsertHistorique(ctx: TenantContext, entry: UpsertHistoriqueInput): Promise<void> {
    return withTenant(this.db, ctx, async (tx) => {
      await tx
        .delete(historiqueCA)
        .where(and(eq(historiqueCA.artisanId, ctx.artisanId), eq(historiqueCA.mois, entry.mois), eq(historiqueCA.annee, entry.annee)));
      await tx.insert(historiqueCA).values({
        artisanId: ctx.artisanId,
        mois: entry.mois,
        annee: entry.annee,
        caTotal: entry.caTotal,
        nombreFactures: entry.nombreFactures,
        nombreClients: entry.nombreClients,
        panierMoyen: entry.panierMoyen,
      });
    });
  }

  upsertPrevision(ctx: TenantContext, entry: UpsertPrevisionInput): Promise<void> {
    return withTenant(this.db, ctx, async (tx) => {
      await tx
        .delete(previsionsCA)
        .where(and(eq(previsionsCA.artisanId, ctx.artisanId), eq(previsionsCA.mois, entry.mois), eq(previsionsCA.annee, entry.annee)));
      await tx.insert(previsionsCA).values({
        artisanId: ctx.artisanId,
        mois: entry.mois,
        annee: entry.annee,
        caPrevisionnel: entry.caPrevisionnel,
        methodeCalcul: entry.methodeCalcul,
        confiance: entry.confiance,
      });
    });
  }
}

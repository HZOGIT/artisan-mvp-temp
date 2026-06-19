import { and, desc, eq, sql } from "drizzle-orm";
import { relancesDevis, devis } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IRelanceDevisRepository } from "../application/relance-devis-repository";
import type { CreateRelanceInput, RelanceDevis, RelanceStatut, RelanceType } from "../domain/relance-devis";

type RelanceRow = typeof relancesDevis.$inferSelect;

function toRelance(r: RelanceRow): RelanceDevis {
  return {
    id: r.id,
    devisId: r.devisId,
    artisanId: r.artisanId,
    type: r.type as RelanceType,
    destinataire: r.destinataire ?? null,
    message: r.message ?? null,
    statut: (r.statut ?? "envoye") as RelanceStatut,
    createdAt: r.createdAt,
  };
}

/*
 * Implémentation Drizzle du repository relances-devis (journal append-only). Double cloisonnement
 * RLS + filtre `artisanId` sur `relances_devis`. `artisanId` forcé à la création ; pas d'update
 * (immuabilité). `devisId` validé via `ownsDevis` (anti-IDOR-FK sur la table `devis`).
 */
export class RelanceDevisRepositoryDrizzle implements IRelanceDevisRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<RelanceDevis[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(relancesDevis)
        .where(eq(relancesDevis.artisanId, ctx.artisanId))
        .orderBy(desc(relancesDevis.createdAt), desc(relancesDevis.id));
      return rows.map(toRelance);
    });
  }

  listByDevis(ctx: TenantContext, devisId: number): Promise<RelanceDevis[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(relancesDevis)
        .where(and(eq(relancesDevis.artisanId, ctx.artisanId), eq(relancesDevis.devisId, devisId)))
        .orderBy(desc(relancesDevis.createdAt), desc(relancesDevis.id));
      return rows.map(toRelance);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<RelanceDevis | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(relancesDevis)
        .where(and(eq(relancesDevis.id, id), eq(relancesDevis.artisanId, ctx.artisanId)))
        .limit(1);
      return row ? toRelance(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreateRelanceInput): Promise<RelanceDevis> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(relancesDevis)
        .values({
          artisanId: ctx.artisanId,
          devisId: input.devisId,
          type: input.type,
          destinataire: input.destinataire ?? null,
          message: input.message ?? null,
          statut: input.statut ?? undefined, // laisse le DEFAULT "envoye"
        })
        .returning();
      return toRelance(row);
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const deleted = await tx
        .delete(relancesDevis)
        .where(and(eq(relancesDevis.id, id), eq(relancesDevis.artisanId, ctx.artisanId)))
        .returning({ id: relancesDevis.id });
      return deleted.length > 0;
    });
  }

  ownsDevis(ctx: TenantContext, devisId: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(devis)
        .where(and(eq(devis.id, devisId), eq(devis.artisanId, ctx.artisanId)));
      return (row?.n ?? 0) > 0;
    });
  }
}

import { eq, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { historiqueDeplacements, techniciens } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IDeplacementRepository, Trajet } from "../application/deplacement-repository";

type Row = typeof historiqueDeplacements.$inferSelect;

function toTrajet(r: Row): Trajet {
  return {
    id: r.id,
    technicienId: r.technicienId,
    interventionId: r.interventionId ?? null,
    dateDebut: r.dateDebut,
    distanceKm: r.distanceKm ?? null,
    adresseDepart: r.adresseDepart ?? null,
    adresseArrivee: r.adresseArrivee ?? null,
    depenseId: r.depenseId ?? null,
  };
}

/**
 * Implémentation Drizzle. Pas de RLS propre sur historique_deplacements — isolation via JOIN
 * techniciens (RLS artisanId appliquée dans le withTenant).
 */
export class DeplacementRepositoryDrizzle implements IDeplacementRepository {
  constructor(private readonly db: DbClient) {}

  getParTenant(ctx: TenantContext, id: number): Promise<Trajet | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ hd: historiqueDeplacements })
        .from(historiqueDeplacements)
        .innerJoin(techniciens, eq(techniciens.id, historiqueDeplacements.technicienId))
        .where(eq(historiqueDeplacements.id, id))
        .limit(1);
      return row ? toTrajet(row.hd) : null;
    });
  }

  listParTenant(ctx: TenantContext): Promise<Trajet[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select({ hd: historiqueDeplacements })
        .from(historiqueDeplacements)
        .innerJoin(techniciens, eq(techniciens.id, historiqueDeplacements.technicienId))
        .orderBy(desc(historiqueDeplacements.dateDebut))
        .limit(200);
      return rows.map((r) => toTrajet(r.hd));
    });
  }

  setDepenseId(ctx: TenantContext, id: number, depenseId: number): Promise<void> {
    return withTenant(this.db, ctx, async (tx) => {
      await tx
        .update(historiqueDeplacements)
        .set({ depenseId })
        .where(
          sql`${historiqueDeplacements.id} = ${id}
              AND ${historiqueDeplacements.technicienId} IN (
                SELECT id FROM techniciens
              )`,
        );
    });
  }

  withDb(db: DbClient): DeplacementRepositoryDrizzle {
    return new DeplacementRepositoryDrizzle(db);
  }
}

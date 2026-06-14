import { and, asc, eq } from "drizzle-orm";
import { activites, chantiers, clients, devis, factures } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IActiviteRepository } from "../application/activite-repository";
import type { Activite, ActiviteEntiteType, CreateActiviteInput } from "../domain/activite";

type Row = typeof activites.$inferSelect;

function toActivite(r: Row): Activite {
  return {
    id: r.id,
    artisanId: r.artisanId,
    type: r.type,
    titre: r.titre,
    echeance: r.echeance,
    entiteType: (r.entiteType ?? "aucun") as ActiviteEntiteType,
    entiteId: r.entiteId ?? null,
    responsableUserId: r.responsableUserId ?? null,
    fait: r.fait,
    faitAt: r.faitAt ?? null,
    note: r.note ?? null,
    createdAt: r.createdAt,
  };
}

// Table d'appartenance par type d'entité (toutes sous RLS + colonne `artisanId`) pour l'anti-IDOR FK.
const ENTITE_TABLE = { client: clients, devis, facture: factures, chantier: chantiers } as const;

// Implémentation Drizzle des activités. Double cloisonnement RLS (GUC app.tenant) + filtre explicite
// `artisanId` (défense en profondeur). Le rattachement FK est vérifié possédé via `ownsEntite`.
export class ActiviteRepositoryDrizzle implements IActiviteRepository {
  constructor(private readonly db: DbClient) {}

  async list(ctx: TenantContext): Promise<Activite[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(activites)
        .where(eq(activites.artisanId, ctx.artisanId))
        // Parité legacy : « à faire » d'abord (fait asc) puis échéance croissante.
        .orderBy(asc(activites.fait), asc(activites.echeance));
      return rows.map(toActivite);
    });
  }

  async create(ctx: TenantContext, input: CreateActiviteInput): Promise<Activite> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(activites)
        .values({
          artisanId: ctx.artisanId,
          type: input.type,
          titre: input.titre,
          echeance: input.echeance,
          entiteType: input.entiteType ?? "aucun",
          entiteId: input.entiteId ?? null,
          note: input.note ?? null,
        })
        .returning();
      return toActivite(row);
    });
  }

  async ownsEntite(ctx: TenantContext, entiteType: ActiviteEntiteType, entiteId: number): Promise<boolean> {
    if (entiteType === "aucun") return false;
    const table = ENTITE_TABLE[entiteType];
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ id: table.id })
        .from(table)
        .where(and(eq(table.id, entiteId), eq(table.artisanId, ctx.artisanId)))
        .limit(1);
      return Boolean(row);
    });
  }

  async setFait(ctx: TenantContext, id: number, fait: boolean): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .update(activites)
        .set({ fait, faitAt: fait ? new Date() : null })
        .where(and(eq(activites.id, id), eq(activites.artisanId, ctx.artisanId)))
        .returning({ id: activites.id });
      return rows.length > 0;
    });
  }

  async remove(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .delete(activites)
        .where(and(eq(activites.id, id), eq(activites.artisanId, ctx.artisanId)))
        .returning({ id: activites.id });
      return rows.length > 0;
    });
  }
}

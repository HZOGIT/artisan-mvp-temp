import { and, desc, eq, sql } from "drizzle-orm";
import { chantiers, clients } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IChantierRepository } from "../application/chantier-repository";
import type { Chantier, CreateChantierInput, UpdateChantierInput } from "../domain/chantier";

type ChantierRow = typeof chantiers.$inferSelect;

function toChantier(r: ChantierRow): Chantier {
  return {
    id: r.id,
    artisanId: r.artisanId,
    clientId: r.clientId,
    reference: r.reference,
    nom: r.nom,
    description: r.description ?? null,
    adresse: r.adresse ?? null,
    codePostal: r.codePostal ?? null,
    ville: r.ville ?? null,
    dateDebut: r.dateDebut ?? null,
    dateFinPrevue: r.dateFinPrevue ?? null,
    dateFinReelle: r.dateFinReelle ?? null,
    budgetPrevisionnel: r.budgetPrevisionnel ?? null,
    budgetRealise: r.budgetRealise ?? "0.00",
    statut: (r.statut ?? "planifie") as Chantier["statut"],
    avancement: r.avancement ?? 0,
    priorite: (r.priorite ?? "normale") as Chantier["priorite"],
    notes: r.notes ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// Implémentation Drizzle du repository chantiers. Double cloisonnement RLS + filtre `artisanId`.
// ⚠️ Toute requête by-id porte `and(eq(id), eq(artisanId, ctx.artisanId))` → aucune fuite
// cross-tenant. `create` insère le `clientId` fourni SANS vérifier son ownership : la garde
// anti-IDOR-FK est portée par le use-case d'écriture (4/9). `update` ne touche pas `clientId`.
export class ChantierRepositoryDrizzle implements IChantierRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<Chantier[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(chantiers)
        .where(eq(chantiers.artisanId, ctx.artisanId))
        .orderBy(desc(chantiers.createdAt), desc(chantiers.id));
      return rows.map(toChantier);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<Chantier | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(chantiers)
        .where(and(eq(chantiers.id, id), eq(chantiers.artisanId, ctx.artisanId)))
        .limit(1);
      return row ? toChantier(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreateChantierInput): Promise<Chantier> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(chantiers)
        .values({ ...input, artisanId: ctx.artisanId } as typeof chantiers.$inferInsert)
        .returning();
      return toChantier(row);
    });
  }

  update(ctx: TenantContext, id: number, input: UpdateChantierInput): Promise<Chantier | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .update(chantiers)
        .set({ ...input, updatedAt: new Date() })
        .where(and(eq(chantiers.id, id), eq(chantiers.artisanId, ctx.artisanId)))
        .returning();
      return row ? toChantier(row) : null;
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const deleted = await tx
        .delete(chantiers)
        .where(and(eq(chantiers.id, id), eq(chantiers.artisanId, ctx.artisanId)))
        .returning({ id: chantiers.id });
      return deleted.length > 0;
    });
  }

  ownsClient(ctx: TenantContext, clientId: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.artisanId, ctx.artisanId)));
      return (row?.n ?? 0) > 0;
    });
  }
}

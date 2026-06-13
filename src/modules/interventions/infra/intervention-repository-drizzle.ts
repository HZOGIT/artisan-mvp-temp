import { and, desc, eq } from "drizzle-orm";
import { interventions } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IInterventionRepository } from "../application/intervention-repository";
import type { Intervention, CreateInterventionInput, UpdateInterventionInput } from "../domain/intervention";

type InterventionRow = typeof interventions.$inferSelect;

function toIntervention(r: InterventionRow): Intervention {
  return {
    id: r.id,
    artisanId: r.artisanId,
    clientId: r.clientId,
    titre: r.titre,
    description: r.description ?? null,
    dateDebut: r.dateDebut,
    dateFin: r.dateFin ?? null,
    statut: (r.statut ?? "planifiee") as Intervention["statut"],
    adresse: r.adresse ?? null,
    notes: r.notes ?? null,
    devisId: r.devisId ?? null,
    factureId: r.factureId ?? null,
    technicienId: r.technicienId ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// Implémentation Drizzle du repository interventions. Double cloisonnement RLS + filtre
// `artisanId`. ⚠️ Toute requête by-id porte `and(eq(id), eq(artisanId, ctx.artisanId))` →
// aucune fuite cross-tenant. `create` insère les FK fournies (clientId/technicienId/…) SANS
// vérifier leur ownership : la garde anti-IDOR-FK est portée par le use-case d'écriture (4/9).
export class InterventionRepositoryDrizzle implements IInterventionRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<Intervention[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(interventions)
        .where(eq(interventions.artisanId, ctx.artisanId))
        .orderBy(desc(interventions.dateDebut), desc(interventions.id));
      return rows.map(toIntervention);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<Intervention | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(interventions)
        .where(and(eq(interventions.id, id), eq(interventions.artisanId, ctx.artisanId)))
        .limit(1);
      return row ? toIntervention(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreateInterventionInput): Promise<Intervention> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(interventions)
        .values({ ...input, artisanId: ctx.artisanId } as typeof interventions.$inferInsert)
        .returning();
      return toIntervention(row);
    });
  }

  update(ctx: TenantContext, id: number, input: UpdateInterventionInput): Promise<Intervention | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .update(interventions)
        .set({ ...input, updatedAt: new Date() })
        .where(and(eq(interventions.id, id), eq(interventions.artisanId, ctx.artisanId)))
        .returning();
      return row ? toIntervention(row) : null;
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const deleted = await tx
        .delete(interventions)
        .where(and(eq(interventions.id, id), eq(interventions.artisanId, ctx.artisanId)))
        .returning({ id: interventions.id });
      return deleted.length > 0;
    });
  }
}

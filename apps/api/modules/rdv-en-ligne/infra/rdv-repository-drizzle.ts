import { and, desc, eq, sql } from "drizzle-orm";
import { rdvEnLigne, clients } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IRdvRepository, SetStatutOptions } from "../application/rdv-repository";
import type { CreateRdvInput, Rdv, RdvStatut, RdvUrgence, UpdateRdvInput } from "../domain/rdv";

type RdvRow = typeof rdvEnLigne.$inferSelect;

function toRdv(r: RdvRow): Rdv {
  return {
    id: r.id,
    artisanId: r.artisanId,
    clientId: r.clientId,
    titre: r.titre,
    description: r.description ?? null,
    dateProposee: r.dateProposee,
    dureeEstimee: r.dureeEstimee ?? 60,
    statut: (r.statut ?? "en_attente") as RdvStatut,
    motifRefus: r.motifRefus ?? null,
    urgence: (r.urgence ?? "normale") as RdvUrgence,
    interventionId: r.interventionId ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/*
 * Implémentation Drizzle du repository rdv-en-ligne. Double cloisonnement RLS + filtre `artisanId`
 * sur `rdv_en_ligne`. `artisanId` forcé et `statut="en_attente"` posé à la création (jamais fournis
 * par l'appelant). Les transitions de statut passent par `setStatut` ; `update` ne touche que les
 * métadonnées. `clientId` validé via `ownsClient` (anti-IDOR-FK, cf. devis).
 */
export class RdvRepositoryDrizzle implements IRdvRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<Rdv[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(rdvEnLigne)
        .where(eq(rdvEnLigne.artisanId, ctx.artisanId))
        .orderBy(desc(rdvEnLigne.dateProposee), desc(rdvEnLigne.id));
      return rows.map(toRdv);
    });
  }

  countByStatut(ctx: TenantContext): Promise<Partial<Record<RdvStatut, number>>> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select({ statut: rdvEnLigne.statut, n: sql<number>`count(*)::int` })
        .from(rdvEnLigne)
        .where(eq(rdvEnLigne.artisanId, ctx.artisanId))
        .groupBy(rdvEnLigne.statut);
      const result: Partial<Record<RdvStatut, number>> = {};
      for (const row of rows) {
        if (row.statut) result[row.statut as RdvStatut] = row.n;
      }
      return result;
    });
  }

  getPendingCount(ctx: TenantContext): Promise<number> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(rdvEnLigne)
        .where(and(eq(rdvEnLigne.artisanId, ctx.artisanId), eq(rdvEnLigne.statut, "en_attente")));
      return row?.n ?? 0;
    });
  }

  getById(ctx: TenantContext, id: number): Promise<Rdv | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(rdvEnLigne)
        .where(and(eq(rdvEnLigne.id, id), eq(rdvEnLigne.artisanId, ctx.artisanId)))
        .limit(1);
      return row ? toRdv(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreateRdvInput): Promise<Rdv> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(rdvEnLigne)
        .values({
          artisanId: ctx.artisanId,
          clientId: input.clientId,
          titre: input.titre,
          description: input.description ?? null,
          dateProposee: input.dateProposee,
          dureeEstimee: input.dureeEstimee ?? undefined,
          urgence: input.urgence ?? undefined,
          /** forcé : jamais fourni par l'appelant */
          statut: "en_attente",
          motifRefus: null,
        })
        .returning();
      return toRdv(row);
    });
  }

  update(ctx: TenantContext, id: number, input: UpdateRdvInput): Promise<Rdv | null> {
    return withTenant(this.db, ctx, async (tx) => {
      /** Métadonnées seulement (UpdateRdvInput exclut statut/motifRefus → état machine protégée). */
      const set: Partial<typeof rdvEnLigne.$inferInsert> = { updatedAt: new Date() };
      if (input.titre !== undefined) set.titre = input.titre;
      if (input.description !== undefined) set.description = input.description;
      if (input.dateProposee !== undefined) set.dateProposee = input.dateProposee;
      if (input.dureeEstimee !== undefined) set.dureeEstimee = input.dureeEstimee;
      if (input.urgence !== undefined) set.urgence = input.urgence;
      const [row] = await tx
        .update(rdvEnLigne)
        .set(set)
        .where(and(eq(rdvEnLigne.id, id), eq(rdvEnLigne.artisanId, ctx.artisanId)))
        .returning();
      return row ? toRdv(row) : null;
    });
  }

  setStatut(ctx: TenantContext, id: number, statut: RdvStatut, options?: SetStatutOptions): Promise<Rdv | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const set: Partial<typeof rdvEnLigne.$inferInsert> = { statut, updatedAt: new Date() };
      if (options?.motifRefus !== undefined) set.motifRefus = options.motifRefus;
      if (options?.interventionId !== undefined) set.interventionId = options.interventionId;
      const [row] = await tx
        .update(rdvEnLigne)
        .set(set)
        .where(and(eq(rdvEnLigne.id, id), eq(rdvEnLigne.artisanId, ctx.artisanId)))
        .returning();
      return row ? toRdv(row) : null;
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const deleted = await tx
        .delete(rdvEnLigne)
        .where(and(eq(rdvEnLigne.id, id), eq(rdvEnLigne.artisanId, ctx.artisanId)))
        .returning({ id: rdvEnLigne.id });
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

  withDb(db: DbClient): RdvRepositoryDrizzle {
    return new RdvRepositoryDrizzle(db);
  }
}

import { randomBytes } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { demandesAvis, clients, interventions } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IDemandeAvisRepository } from "../application/demande-avis-repository";
import type { CreateDemandeAvisInput, DemandeAvis, DemandeAvisStatut } from "../domain/demande-avis";

type DemandeAvisRow = typeof demandesAvis.$inferSelect;

const TRENTE_JOURS_MS = 30 * 24 * 60 * 60 * 1000;

function toDemandeAvis(r: DemandeAvisRow): DemandeAvis {
  return {
    id: r.id,
    artisanId: r.artisanId,
    clientId: r.clientId,
    interventionId: r.interventionId,
    tokenDemande: r.tokenDemande,
    emailEnvoyeAt: r.emailEnvoyeAt ?? null,
    avisRecuAt: r.avisRecuAt ?? null,
    statut: (r.statut ?? "envoyee") as DemandeAvisStatut,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
  };
}

// Implémentation Drizzle du repository demandes-avis. Double cloisonnement RLS + filtre `artisanId`
// sur `demandes_avis`. `artisanId` forcé, `tokenDemande` généré serveur (64 hex, unique) et
// `statut="envoyee"` posés à la création. Les transitions de statut passent par `setStatut`
// (`avisRecuAt` posé à la complétion). `clientId`/`interventionId` validés via ownsClient/ownsIntervention.
export class DemandeAvisRepositoryDrizzle implements IDemandeAvisRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<DemandeAvis[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(demandesAvis)
        .where(eq(demandesAvis.artisanId, ctx.artisanId))
        .orderBy(desc(demandesAvis.createdAt), desc(demandesAvis.id));
      return rows.map(toDemandeAvis);
    });
  }

  listByStatut(ctx: TenantContext, statut: DemandeAvisStatut): Promise<DemandeAvis[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(demandesAvis)
        .where(and(eq(demandesAvis.artisanId, ctx.artisanId), eq(demandesAvis.statut, statut)))
        .orderBy(desc(demandesAvis.createdAt), desc(demandesAvis.id));
      return rows.map(toDemandeAvis);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<DemandeAvis | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(demandesAvis)
        .where(and(eq(demandesAvis.id, id), eq(demandesAvis.artisanId, ctx.artisanId)))
        .limit(1);
      return row ? toDemandeAvis(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreateDemandeAvisInput): Promise<DemandeAvis> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(demandesAvis)
        .values({
          artisanId: ctx.artisanId, // forcé
          clientId: input.clientId,
          interventionId: input.interventionId,
          tokenDemande: randomBytes(32).toString("hex"), // 64 hex, généré serveur
          statut: "envoyee", // forcé
          expiresAt: input.expiresAt ?? new Date(Date.now() + TRENTE_JOURS_MS),
        })
        .returning();
      return toDemandeAvis(row);
    });
  }

  setStatut(ctx: TenantContext, id: number, statut: DemandeAvisStatut): Promise<DemandeAvis | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const set: Partial<typeof demandesAvis.$inferInsert> = { statut };
      if (statut === "completee") set.avisRecuAt = new Date();
      const [row] = await tx
        .update(demandesAvis)
        .set(set)
        .where(and(eq(demandesAvis.id, id), eq(demandesAvis.artisanId, ctx.artisanId)))
        .returning();
      return row ? toDemandeAvis(row) : null;
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const deleted = await tx
        .delete(demandesAvis)
        .where(and(eq(demandesAvis.id, id), eq(demandesAvis.artisanId, ctx.artisanId)))
        .returning({ id: demandesAvis.id });
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

  ownsIntervention(ctx: TenantContext, interventionId: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(interventions)
        .where(and(eq(interventions.id, interventionId), eq(interventions.artisanId, ctx.artisanId)));
      return (row?.n ?? 0) > 0;
    });
  }
}

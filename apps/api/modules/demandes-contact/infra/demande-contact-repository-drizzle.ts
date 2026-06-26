import { and, desc, eq, sql } from "drizzle-orm";
import { demandesContact, clients } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IDemandeContactRepository } from "../application/demande-contact-repository";
import type { CreateDemandeInput, DemandeContact, DemandeContactStatut, UpdateDemandeInput } from "../domain/demande-contact";

type DemandeRow = typeof demandesContact.$inferSelect;

function toDemande(r: DemandeRow): DemandeContact {
  return {
    id: r.id,
    artisanId: r.artisanId,
    nom: r.nom,
    email: r.email ?? null,
    telephone: r.telephone ?? null,
    message: r.message ?? null,
    source: r.source ?? "vitrine",
    statut: (r.statut ?? "nouveau") as DemandeContactStatut,
    clientId: r.clientId ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/*
 * Implémentation Drizzle du repository demandes-contact. Double cloisonnement RLS + filtre
 * `artisanId` sur `demandes_contact`. `artisanId` forcé et `statut="nouveau"` posé à la création.
 * Les transitions de statut passent par `setStatut` (+ clientId à la conversion) ; `update` ne touche
 * que les métadonnées. `clientId` validé via `ownsClient`.
 */
export class DemandeContactRepositoryDrizzle implements IDemandeContactRepository {
  constructor(private readonly db: DbClient) {}

  withDb(db: DbClient): DemandeContactRepositoryDrizzle {
    return new DemandeContactRepositoryDrizzle(db);
  }

  list(ctx: TenantContext): Promise<DemandeContact[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(demandesContact)
        .where(eq(demandesContact.artisanId, ctx.artisanId))
        .orderBy(desc(demandesContact.createdAt), desc(demandesContact.id));
      return rows.map(toDemande);
    });
  }

  listByStatut(ctx: TenantContext, statut: DemandeContactStatut): Promise<DemandeContact[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(demandesContact)
        .where(and(eq(demandesContact.artisanId, ctx.artisanId), eq(demandesContact.statut, statut)))
        .orderBy(desc(demandesContact.createdAt), desc(demandesContact.id));
      return rows.map(toDemande);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<DemandeContact | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(demandesContact)
        .where(and(eq(demandesContact.id, id), eq(demandesContact.artisanId, ctx.artisanId)))
        .limit(1);
      return row ? toDemande(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreateDemandeInput): Promise<DemandeContact> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(demandesContact)
        .values({
          artisanId: ctx.artisanId,
          nom: input.nom,
          email: input.email ?? null,
          telephone: input.telephone ?? null,
          message: input.message ?? null,
          /** défaut PG "vitrine" */
          source: input.source ?? undefined,
          /** forcé */
          statut: "nouveau",
          clientId: null,
        })
        .returning();
      return toDemande(row);
    });
  }

  update(ctx: TenantContext, id: number, input: UpdateDemandeInput): Promise<DemandeContact | null> {
    return withTenant(this.db, ctx, async (tx) => {
      /** Métadonnées seulement (UpdateDemandeInput exclut statut/clientId → état machine protégée). */
      const set: Partial<typeof demandesContact.$inferInsert> = { updatedAt: new Date() };
      if (input.nom !== undefined) set.nom = input.nom;
      if (input.email !== undefined) set.email = input.email;
      if (input.telephone !== undefined) set.telephone = input.telephone;
      if (input.message !== undefined) set.message = input.message;
      if (input.source !== undefined) set.source = input.source;
      const [row] = await tx
        .update(demandesContact)
        .set(set)
        .where(and(eq(demandesContact.id, id), eq(demandesContact.artisanId, ctx.artisanId)))
        .returning();
      return row ? toDemande(row) : null;
    });
  }

  setStatut(ctx: TenantContext, id: number, statut: DemandeContactStatut, clientId?: number | null): Promise<DemandeContact | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const set: Partial<typeof demandesContact.$inferInsert> = { statut, updatedAt: new Date() };
      if (clientId !== undefined) set.clientId = clientId;
      const [row] = await tx
        .update(demandesContact)
        .set(set)
        .where(and(eq(demandesContact.id, id), eq(demandesContact.artisanId, ctx.artisanId)))
        .returning();
      return row ? toDemande(row) : null;
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const deleted = await tx
        .delete(demandesContact)
        .where(and(eq(demandesContact.id, id), eq(demandesContact.artisanId, ctx.artisanId)))
        .returning({ id: demandesContact.id });
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

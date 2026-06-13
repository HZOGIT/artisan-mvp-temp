import { and, asc, eq } from "drizzle-orm";
import { clients } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IClientRepository } from "../application/client-repository";
import type { Client, CreateClientInput, UpdateClientInput } from "../domain/client";

type ClientRow = typeof clients.$inferSelect;

function toClient(r: ClientRow): Client {
  return {
    id: r.id,
    artisanId: r.artisanId,
    nom: r.nom,
    prenom: r.prenom ?? null,
    email: r.email ?? null,
    telephone: r.telephone ?? null,
    adresse: r.adresse ?? null,
    codePostal: r.codePostal ?? null,
    ville: r.ville ?? null,
    adresseFacturation: r.adresseFacturation ?? null,
    codePostalFacturation: r.codePostalFacturation ?? null,
    villeFacturation: r.villeFacturation ?? null,
    type: (r.type ?? "particulier") as Client["type"],
    raisonSociale: r.raisonSociale ?? null,
    siret: r.siret ?? null,
    numeroTVA: r.numeroTVA ?? null,
    etiquettes: r.etiquettes ?? null,
    notes: r.notes ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// Implémentation Drizzle du repository clients. Double cloisonnement RLS + filtre `artisanId`
// sur `clients` (PII). ⚠️ Toute requête by-id porte `and(eq(id), eq(artisanId, ctx.artisanId))`
// → aucune fuite cross-tenant. `delete` ici = suppression simple scopée ; la garde d'intégrité
// référentielle (documents liés) est portée par le use-case d'écriture.
export class ClientRepositoryDrizzle implements IClientRepository {
  constructor(private readonly db: DbClient) {}

  list(ctx: TenantContext): Promise<Client[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const rows = await tx
        .select()
        .from(clients)
        .where(eq(clients.artisanId, ctx.artisanId))
        .orderBy(asc(clients.nom), asc(clients.id));
      return rows.map(toClient);
    });
  }

  getById(ctx: TenantContext, id: number): Promise<Client | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(clients)
        .where(and(eq(clients.id, id), eq(clients.artisanId, ctx.artisanId)))
        .limit(1);
      return row ? toClient(row) : null;
    });
  }

  create(ctx: TenantContext, input: CreateClientInput): Promise<Client> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .insert(clients)
        .values({ ...input, artisanId: ctx.artisanId } as typeof clients.$inferInsert)
        .returning();
      return toClient(row);
    });
  }

  update(ctx: TenantContext, id: number, input: UpdateClientInput): Promise<Client | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .update(clients)
        .set({ ...input, updatedAt: new Date() })
        .where(and(eq(clients.id, id), eq(clients.artisanId, ctx.artisanId)))
        .returning();
      return row ? toClient(row) : null;
    });
  }

  delete(ctx: TenantContext, id: number): Promise<boolean> {
    return withTenant(this.db, ctx, async (tx) => {
      const deleted = await tx
        .delete(clients)
        .where(and(eq(clients.id, id), eq(clients.artisanId, ctx.artisanId)))
        .returning({ id: clients.id });
      return deleted.length > 0;
    });
  }
}

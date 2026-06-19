import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import {
  clients,
  devis,
  factures,
  interventions,
  chantiers,
  contratsMaintenance,
} from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IClientRepository } from "../application/client-repository";
import type { FactureEncoursLigne } from "../application/encours";
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

/*
 * Implémentation Drizzle du repository clients. Double cloisonnement RLS + filtre `artisanId`
 * sur `clients` (PII). ⚠️ Toute requête by-id porte `and(eq(id), eq(artisanId, ctx.artisanId))`
 * → aucune fuite cross-tenant. `delete` ici = suppression simple scopée ; la garde d'intégrité
 * référentielle (documents liés) est portée par le use-case d'écriture.
 */
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

  countDocumentsLies(ctx: TenantContext, clientId: number): Promise<number> {
    return withTenant(this.db, ctx, async (tx) => {
      const a = ctx.artisanId;
      /*
       * Double cloisonnement : clientId + artisanId (en plus de la RLS). Chaque table porte
       * un `artisanId` (toutes RLS-isolées) → on compte uniquement les documents du tenant.
       */
      const n = sql<number>`count(*)::int`;
      const [d] = await tx.select({ n }).from(devis).where(and(eq(devis.clientId, clientId), eq(devis.artisanId, a)));
      const [f] = await tx.select({ n }).from(factures).where(and(eq(factures.clientId, clientId), eq(factures.artisanId, a)));
      const [i] = await tx
        .select({ n })
        .from(interventions)
        .where(and(eq(interventions.clientId, clientId), eq(interventions.artisanId, a)));
      const [c] = await tx
        .select({ n })
        .from(chantiers)
        .where(and(eq(chantiers.clientId, clientId), eq(chantiers.artisanId, a)));
      const [ct] = await tx
        .select({ n })
        .from(contratsMaintenance)
        .where(and(eq(contratsMaintenance.clientId, clientId), eq(contratsMaintenance.artisanId, a)));
      return (d?.n ?? 0) + (f?.n ?? 0) + (i?.n ?? 0) + (c?.n ?? 0) + (ct?.n ?? 0);
    });
  }

  search(ctx: TenantContext, query: string): Promise<Client[]> {
    return withTenant(this.db, ctx, async (tx) => {
      /*
       * Échappe les métacaractères LIKE (`\` d'abord, puis `%` et `_`) avec le caractère
       * d'échappement par défaut de Postgres (`\`) → la saisie est traitée littéralement.
       */
      const escaped = query.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
      const term = `%${escaped}%`;
      const rows = await tx
        .select()
        .from(clients)
        .where(
          and(
            eq(clients.artisanId, ctx.artisanId),
            or(
              ilike(clients.nom, term),
              ilike(clients.prenom, term),
              ilike(clients.email, term),
              ilike(clients.telephone, term),
            ),
          ),
        )
        .orderBy(asc(clients.nom), asc(clients.id));
      return rows.map(toClient);
    });
  }

  listFacturesPourEncours(ctx: TenantContext, clientId?: number): Promise<FactureEncoursLigne[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const where =
        clientId != null
          ? and(eq(factures.artisanId, ctx.artisanId), eq(factures.clientId, clientId))
          : eq(factures.artisanId, ctx.artisanId);
      const rows = await tx
        .select({
          clientId: factures.clientId,
          statut: factures.statut,
          totalTTC: factures.totalTTC,
          montantPaye: factures.montantPaye,
          dateEcheance: factures.dateEcheance,
          typeDocument: factures.typeDocument,
        })
        .from(factures)
        .where(where);
      return rows.map((r) => ({
        clientId: r.clientId,
        statut: r.statut ?? "",
        totalTTC: r.totalTTC ?? null,
        montantPaye: r.montantPaye ?? null,
        dateEcheance: r.dateEcheance ?? null,
        typeDocument: r.typeDocument ?? null,
      }));
    });
  }
}

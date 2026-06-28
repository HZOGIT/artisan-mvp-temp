import { and, asc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import {
  clients,
  clientPortalAccess,
  clientPortalSessions,
  devis,
  factures,
  interventions,
  chantiers,
  contratsMaintenance,
  rdvEnLigne,
  analysesPhotosChantier,
  avisClients,
  demandesContact,
  demandesAvis,
  conversations,
} from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IClientRepository } from "../application/client-repository";
import type { FactureEncoursLigne } from "../application/encours";
import { champsFusionnes, type Client, type CreateClientInput, type UpdateClientInput } from "../domain/client";

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
        .where(and(eq(clients.artisanId, ctx.artisanId), isNull(clients.archivedAt)))
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

  fusionner(ctx: TenantContext, survivantId: number, doublonId: number): Promise<Client | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const a = ctx.artisanId;
      /*
       * Garde de cloisonnement DANS la transaction : les deux clients doivent appartenir au
       * tenant. Sinon on n'altère rien (rollback implicite : on n'a encore rien écrit) → null.
       */
      const proprietes = await tx
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.artisanId, a), or(eq(clients.id, survivantId), eq(clients.id, doublonId))));
      const ids = new Set(proprietes.map((r) => r.id));
      if (!ids.has(survivantId) || !ids.has(doublonId)) return null;

      const set = { clientId: survivantId };
      /*
       * Réaffectation EXHAUSTIVE de chaque table portant un `clientId` (12 tables RLS + filtre
       * artisanId). Une table oubliée = historique orphelin. Les lignes filles (devis_lignes,
       * factures_lignes…) suivent leur parent → pas de réaffectation directe.
       */
      await tx.update(factures).set(set).where(and(eq(factures.clientId, doublonId), eq(factures.artisanId, a)));
      await tx.update(devis).set(set).where(and(eq(devis.clientId, doublonId), eq(devis.artisanId, a)));
      await tx.update(interventions).set(set).where(and(eq(interventions.clientId, doublonId), eq(interventions.artisanId, a)));
      await tx.update(contratsMaintenance).set(set).where(and(eq(contratsMaintenance.clientId, doublonId), eq(contratsMaintenance.artisanId, a)));
      await tx.update(rdvEnLigne).set(set).where(and(eq(rdvEnLigne.clientId, doublonId), eq(rdvEnLigne.artisanId, a)));
      await tx.update(chantiers).set(set).where(and(eq(chantiers.clientId, doublonId), eq(chantiers.artisanId, a)));
      await tx.update(analysesPhotosChantier).set(set).where(and(eq(analysesPhotosChantier.clientId, doublonId), eq(analysesPhotosChantier.artisanId, a)));
      await tx.update(avisClients).set(set).where(and(eq(avisClients.clientId, doublonId), eq(avisClients.artisanId, a)));
      await tx.update(demandesContact).set(set).where(and(eq(demandesContact.clientId, doublonId), eq(demandesContact.artisanId, a)));
      await tx.update(demandesAvis).set(set).where(and(eq(demandesAvis.clientId, doublonId), eq(demandesAvis.artisanId, a)));
      await tx.update(conversations).set(set).where(and(eq(conversations.clientId, doublonId), eq(conversations.artisanId, a)));
      await tx.update(clientPortalAccess).set(set).where(and(eq(clientPortalAccess.clientId, doublonId), eq(clientPortalAccess.artisanId, a)));
      /*
       * `client_portal_sessions` n'a NI artisanId NI RLS (jeton de session éphémère du portail).
       * Le scope tenant tient car `doublonId` a été prouvé appartenir au tenant ci-dessus.
       */
      await tx.update(clientPortalSessions).set(set).where(eq(clientPortalSessions.clientId, doublonId));

      /* Complète les champs vides du survivant à partir du doublon (règle pure, no-op si complet). */
      const [survRow] = await tx.select().from(clients).where(eq(clients.id, survivantId)).limit(1);
      const [dblRow] = await tx.select().from(clients).where(eq(clients.id, doublonId)).limit(1);
      const maj = champsFusionnes(toClient(survRow), toClient(dblRow));
      if (Object.keys(maj).length > 0) {
        await tx.update(clients).set({ ...maj, updatedAt: new Date() }).where(and(eq(clients.id, survivantId), eq(clients.artisanId, a)));
      }

      /* Archive le doublon (jamais de delete dur). `WHERE archivedAt IS NULL` → idempotent. */
      await tx
        .update(clients)
        .set({ archivedAt: new Date() })
        .where(and(eq(clients.id, doublonId), eq(clients.artisanId, a), isNull(clients.archivedAt)));

      const [updated] = await tx
        .select()
        .from(clients)
        .where(and(eq(clients.id, survivantId), eq(clients.artisanId, a)))
        .limit(1);
      return updated ? toClient(updated) : null;
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
            isNull(clients.archivedAt),
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

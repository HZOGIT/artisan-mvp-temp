import { and, eq, gte } from "drizzle-orm";
import { artisans, clientPortalAccess, clients } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withPublicToken, withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { CreateAccessData, IPortalAccessRepository } from "../application/portal-access-repository";
import type { ArtisanPortalInfo, ClientPortalInfo, PortalAccessRef, PortalAccessStatus } from "../domain/portal-access";

/*
 * Repository d'accès au portail. `resolveByToken` lit `client_portal_access` sous la policy public-token
 * RLS (token ACTIF + non expiré). Les écritures/lectures tenant repassent par `withTenant(artisanId)`.
 * `artisans` est HORS RLS (lecture directe par id).
 */
export class PortalAccessRepositoryDrizzle implements IPortalAccessRepository {
  constructor(private readonly db: DbClient) {}

  resolveByToken(token: string, now: Date): Promise<PortalAccessRef | null> {
    return withPublicToken(this.db, token, async (tx) => {
      const [r] = await tx
        .select({ id: clientPortalAccess.id, clientId: clientPortalAccess.clientId, artisanId: clientPortalAccess.artisanId })
        .from(clientPortalAccess)
        .where(and(eq(clientPortalAccess.token, token), eq(clientPortalAccess.isActive, true), gte(clientPortalAccess.expiresAt, now)))
        .limit(1);
      return r ?? null;
    });
  }

  async touchLastAccess(ctx: TenantContext, accessId: number, now: Date): Promise<void> {
    await withTenant(this.db, ctx, async (tx) => {
      await tx.update(clientPortalAccess).set({ lastAccessAt: now }).where(and(eq(clientPortalAccess.id, accessId), eq(clientPortalAccess.artisanId, ctx.artisanId)));
    });
  }

  getClientInfo(ctx: TenantContext, clientId: number): Promise<ClientPortalInfo | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [c] = await tx
        .select({ id: clients.id, nom: clients.nom, prenom: clients.prenom, email: clients.email, telephone: clients.telephone, adresse: clients.adresse, codePostal: clients.codePostal, ville: clients.ville })
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.artisanId, ctx.artisanId)))
        .limit(1);
      if (!c) return null;
      return { id: c.id, nom: c.nom, prenom: c.prenom ?? null, email: c.email ?? null, telephone: c.telephone ?? null, adresse: c.adresse ?? null, codePostal: c.codePostal ?? null, ville: c.ville ?? null };
    });
  }

  async getArtisanPublic(artisanId: number): Promise<ArtisanPortalInfo | null> {
    const [a] = await this.db
      .select({ id: artisans.id, nomEntreprise: artisans.nomEntreprise, telephone: artisans.telephone, email: artisans.email, adresse: artisans.adresse, codePostal: artisans.codePostal, ville: artisans.ville, siret: artisans.siret, logo: artisans.logo })
      .from(artisans)
      .where(eq(artisans.id, artisanId))
      .limit(1);
    if (!a) return null;
    return { id: a.id, nomEntreprise: a.nomEntreprise ?? null, telephone: a.telephone ?? null, email: a.email ?? null, adresse: a.adresse ?? null, codePostal: a.codePostal ?? null, ville: a.ville ?? null, siret: a.siret ?? null, logo: a.logo ?? null };
  }

  async createAccess(ctx: TenantContext, data: CreateAccessData): Promise<void> {
    await withTenant(this.db, ctx, async (tx) => {
      /** Parité legacy : un nouveau lien remplace l'ancien → on désactive les accès existants du client. */
      await tx.update(clientPortalAccess).set({ isActive: false }).where(and(eq(clientPortalAccess.clientId, data.clientId), eq(clientPortalAccess.artisanId, ctx.artisanId)));
      await tx.insert(clientPortalAccess).values({ clientId: data.clientId, artisanId: ctx.artisanId, token: data.token, email: data.email, expiresAt: data.expiresAt, isActive: true });
    });
  }

  getStatusByClientId(ctx: TenantContext, clientId: number): Promise<PortalAccessStatus | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const [a] = await tx
        .select({ isActive: clientPortalAccess.isActive, token: clientPortalAccess.token, expiresAt: clientPortalAccess.expiresAt, lastAccessAt: clientPortalAccess.lastAccessAt, createdAt: clientPortalAccess.createdAt })
        .from(clientPortalAccess)
        .where(and(eq(clientPortalAccess.clientId, clientId), eq(clientPortalAccess.artisanId, ctx.artisanId), eq(clientPortalAccess.isActive, true)))
        .limit(1);
      if (!a) return null;
      return { actif: a.isActive ?? false, token: a.token, dateExpiration: a.expiresAt, lastAccessAt: a.lastAccessAt ?? null, createdAt: a.createdAt };
    });
  }

  async deactivateByClientId(ctx: TenantContext, clientId: number): Promise<void> {
    await withTenant(this.db, ctx, async (tx) => {
      await tx.update(clientPortalAccess).set({ isActive: false }).where(and(eq(clientPortalAccess.clientId, clientId), eq(clientPortalAccess.artisanId, ctx.artisanId)));
    });
  }
}

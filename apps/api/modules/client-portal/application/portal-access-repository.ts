import type { TenantContext } from "../../../shared/tenant";
import type { ArtisanPortalInfo, ClientPortalInfo, PortalAccessRef, PortalAccessStatus } from "../domain/portal-access";

export interface CreateAccessData {
  readonly clientId: number;
  readonly token: string;
  readonly email: string;
  readonly expiresAt: Date;
}

/*
 * Port d'accès au portail client. `resolveByToken` lit `client_portal_access` sous la policy
 * public-token RLS (token ACTIF + non expiré) → l'accès résolu (id/clientId/artisanId). Les autres
 * méthodes sont scopées tenant (artisanId résolu ou cookie artisan). `getArtisanPublic` lit `artisans`
 * (HORS RLS). Anti-IDOR : les ops admin vérifient l'appartenance du client au tenant en amont.
 */
export interface IPortalAccessRepository {
  /** PUBLIC (token) : accès actif + non expiré, sinon null. */
  resolveByToken(token: string, now: Date): Promise<PortalAccessRef | null>;
  /** Met à jour la date de dernier accès (sous le tenant résolu). */
  touchLastAccess(ctx: TenantContext, accessId: number, now: Date): Promise<void>;
  /** Lecture du client (scopé tenant résolu). */
  getClientInfo(ctx: TenantContext, clientId: number): Promise<ClientPortalInfo | null>;
  /** Lecture de l'artisan (HORS RLS, par id). */
  getArtisanPublic(artisanId: number): Promise<ArtisanPortalInfo | null>;

  /*
   * ADMIN (cookie artisan, scopé tenant) :
   * Crée un accès portail (désactive un éventuel accès précédent du même client — parité legacy upsert).
   */
  createAccess(ctx: TenantContext, data: CreateAccessData): Promise<void>;
  /** Statut de l'accès d'un client (null si aucun). */
  getStatusByClientId(ctx: TenantContext, clientId: number): Promise<PortalAccessStatus | null>;
  /** Désactive l'accès portail d'un client (idempotent). */
  deactivateByClientId(ctx: TenantContext, clientId: number): Promise<void>;
}

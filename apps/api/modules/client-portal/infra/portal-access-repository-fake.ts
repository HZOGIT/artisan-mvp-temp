import type { TenantContext } from "../../../shared/tenant";
import type { CreateAccessData, IPortalAccessRepository } from "../application/portal-access-repository";
import type { ArtisanPortalInfo, ClientPortalInfo, PortalAccessRef, PortalAccessStatus } from "../domain/portal-access";

interface AccessRow {
  id: number;
  clientId: number;
  artisanId: number;
  token: string;
  email: string;
  expiresAt: Date;
  isActive: boolean;
  lastAccessAt: Date | null;
  createdAt: Date;
}

export interface PortalFakeState {
  accesses?: AccessRow[];
  clients?: Record<number, ClientPortalInfo>;
  artisans?: Record<number, ArtisanPortalInfo>;
}

// Fake en mémoire de l'accès portail (résolution token actif+non expiré, scope tenant simulé).
export class PortalAccessRepositoryFake implements IPortalAccessRepository {
  accesses: AccessRow[];
  private clientsById: Record<number, ClientPortalInfo>;
  private artisansById: Record<number, ArtisanPortalInfo>;
  private seq: number;

  constructor(state: PortalFakeState = {}) {
    this.accesses = state.accesses ?? [];
    this.clientsById = state.clients ?? {};
    this.artisansById = state.artisans ?? {};
    this.seq = this.accesses.reduce((m, a) => Math.max(m, a.id), 0) + 1;
  }

  async resolveByToken(token: string, now: Date): Promise<PortalAccessRef | null> {
    const a = this.accesses.find((x) => x.token === token && x.isActive && x.expiresAt >= now);
    return a ? { id: a.id, clientId: a.clientId, artisanId: a.artisanId } : null;
  }

  async touchLastAccess(_ctx: TenantContext, accessId: number, now: Date): Promise<void> {
    const a = this.accesses.find((x) => x.id === accessId);
    if (a) a.lastAccessAt = now;
  }

  async getClientInfo(_ctx: TenantContext, clientId: number): Promise<ClientPortalInfo | null> {
    return this.clientsById[clientId] ?? null;
  }

  async getArtisanPublic(artisanId: number): Promise<ArtisanPortalInfo | null> {
    return this.artisansById[artisanId] ?? null;
  }

  async createAccess(ctx: TenantContext, data: CreateAccessData): Promise<void> {
    for (const a of this.accesses) if (a.clientId === data.clientId && a.artisanId === ctx.artisanId) a.isActive = false;
    this.accesses.push({ id: this.seq++, clientId: data.clientId, artisanId: ctx.artisanId, token: data.token, email: data.email, expiresAt: data.expiresAt, isActive: true, lastAccessAt: null, createdAt: new Date() });
  }

  async getStatusByClientId(ctx: TenantContext, clientId: number): Promise<PortalAccessStatus | null> {
    const a = this.accesses.find((x) => x.clientId === clientId && x.artisanId === ctx.artisanId && x.isActive);
    if (!a) return null;
    return { actif: a.isActive, token: a.token, dateExpiration: a.expiresAt, lastAccessAt: a.lastAccessAt, createdAt: a.createdAt };
  }

  async deactivateByClientId(ctx: TenantContext, clientId: number): Promise<void> {
    for (const a of this.accesses) if (a.clientId === clientId && a.artisanId === ctx.artisanId) a.isActive = false;
  }
}

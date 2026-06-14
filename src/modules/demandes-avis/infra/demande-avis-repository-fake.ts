import { TenantContext } from "../../../shared/tenant";
import type { IDemandeAvisRepository } from "../application/demande-avis-repository";
import type { CreateDemandeAvisInput, DemandeAvis, DemandeAvisStatut } from "../domain/demande-avis";

const TRENTE_JOURS_MS = 30 * 24 * 60 * 60 * 1000;

// Implémentation in-memory du repository demandes-avis (tests sans DB). Reproduit les invariants du
// repo Drizzle : scope par artisanId, artisanId forcé, token généré serveur (unique), statut="envoyee"
// à la création, setStatut applique la transition (+ avisRecuAt à la complétion). `ownsClient`/
// `ownsIntervention` via des Sets seedables (clé "artisanId:fkId").
export class FakeDemandeAvisRepository implements IDemandeAvisRepository {
  private readonly store: DemandeAvis[] = [];
  private seq = 0;
  private tokenSeq = 0;
  private readonly clientsOwned = new Set<string>();
  private readonly interventionsOwned = new Set<string>();

  // Helpers de seed pour les tests (anti-IDOR-FK).
  seedClient(ctx: TenantContext, clientId: number): void {
    this.clientsOwned.add(`${ctx.artisanId}:${clientId}`);
  }
  seedIntervention(ctx: TenantContext, interventionId: number): void {
    this.interventionsOwned.add(`${ctx.artisanId}:${interventionId}`);
  }

  private scoped(ctx: TenantContext): DemandeAvis[] {
    return this.store.filter((d) => d.artisanId === ctx.artisanId);
  }

  async list(ctx: TenantContext): Promise<DemandeAvis[]> {
    return [...this.scoped(ctx)].sort((a, b) => b.id - a.id);
  }

  async listByStatut(ctx: TenantContext, statut: DemandeAvisStatut): Promise<DemandeAvis[]> {
    return (await this.list(ctx)).filter((d) => d.statut === statut);
  }

  async getById(ctx: TenantContext, id: number): Promise<DemandeAvis | null> {
    return this.scoped(ctx).find((d) => d.id === id) ?? null;
  }

  async create(ctx: TenantContext, input: CreateDemandeAvisInput): Promise<DemandeAvis> {
    const demande: DemandeAvis = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      clientId: input.clientId,
      interventionId: input.interventionId,
      tokenDemande: `tok-${++this.tokenSeq}-${Date.now()}`,
      emailEnvoyeAt: null,
      avisRecuAt: null,
      statut: "envoyee",
      expiresAt: input.expiresAt ?? new Date(Date.now() + TRENTE_JOURS_MS),
      createdAt: new Date(),
    };
    this.store.push(demande);
    return demande;
  }

  async setStatut(ctx: TenantContext, id: number, statut: DemandeAvisStatut): Promise<DemandeAvis | null> {
    const idx = this.store.findIndex((d) => d.id === id && d.artisanId === ctx.artisanId);
    if (idx === -1) return null;
    const next: DemandeAvis = {
      ...this.store[idx],
      statut,
      ...(statut === "completee" ? { avisRecuAt: new Date() } : {}),
    };
    this.store[idx] = next;
    return next;
  }

  async delete(ctx: TenantContext, id: number): Promise<boolean> {
    const idx = this.store.findIndex((d) => d.id === id && d.artisanId === ctx.artisanId);
    if (idx === -1) return false;
    this.store.splice(idx, 1);
    return true;
  }

  async ownsClient(ctx: TenantContext, clientId: number): Promise<boolean> {
    return this.clientsOwned.has(`${ctx.artisanId}:${clientId}`);
  }

  async ownsIntervention(ctx: TenantContext, interventionId: number): Promise<boolean> {
    return this.interventionsOwned.has(`${ctx.artisanId}:${interventionId}`);
  }
}

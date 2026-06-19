import type { TenantContext } from "../../../shared/tenant";
import type { IDemandeAvisRepository } from "../application/demande-avis-repository";
import type { ClientRef, CreerDemandeInput, DemandeAvis, InterventionRef } from "../domain/demande-avis";

interface SeedClient extends ClientRef {
  readonly artisanId: number;
}
interface SeedIntervention extends InterventionRef {
  readonly artisanId: number;
}

/*
 * Double in-memory du repository demande d'avis (tests use-cases sans DB). Reproduit le
 * scoping tenant : une ressource d'un autre artisan est invisible (null).
 */
export class FakeDemandeAvisRepository implements IDemandeAvisRepository {
  readonly demandes: DemandeAvis[] = [];
  private clientsStore: SeedClient[] = [];
  private interventionsStore: SeedIntervention[] = [];
  private seq = 0;

  seedClient(c: SeedClient): void {
    this.clientsStore.push(c);
  }
  seedIntervention(i: SeedIntervention): void {
    this.interventionsStore.push(i);
  }

  async getInterventionOwned(ctx: TenantContext, interventionId: number): Promise<InterventionRef | null> {
    const i = this.interventionsStore.find((x) => x.id === interventionId && x.artisanId === ctx.artisanId);
    return i ? { id: i.id, clientId: i.clientId, dateDebut: i.dateDebut } : null;
  }

  async getClientOwned(ctx: TenantContext, clientId: number): Promise<ClientRef | null> {
    const c = this.clientsStore.find((x) => x.id === clientId && x.artisanId === ctx.artisanId);
    return c ? { id: c.id, nom: c.nom, email: c.email } : null;
  }

  async getDerniereInterventionDuClient(ctx: TenantContext, clientId: number): Promise<InterventionRef | null> {
    const candidats = this.interventionsStore
      .filter((x) => x.clientId === clientId && x.artisanId === ctx.artisanId)
      .sort((a, b) => b.dateDebut.getTime() - a.dateDebut.getTime());
    const i = candidats[0];
    return i ? { id: i.id, clientId: i.clientId, dateDebut: i.dateDebut } : null;
  }

  async creerDemande(ctx: TenantContext, input: CreerDemandeInput): Promise<DemandeAvis> {
    const demande: DemandeAvis = {
      id: ++this.seq,
      artisanId: ctx.artisanId,
      clientId: input.clientId,
      interventionId: input.interventionId,
      tokenDemande: input.tokenDemande,
      emailEnvoyeAt: input.emailEnvoyeAt,
      expiresAt: input.expiresAt,
      statut: "envoyee",
      createdAt: new Date(),
    };
    this.demandes.push(demande);
    return demande;
  }
}

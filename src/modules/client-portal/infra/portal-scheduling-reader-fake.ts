import type { TenantContext } from "../../../shared/tenant";
import type { CreateRdvData, IPortalSchedulingReader, PortalChantier, PortalRdv } from "../application/portal-scheduling-reader";
import type { CreneauOccupe } from "../domain/portal-scheduling";

export interface SchedulingFakeState {
  occupied?: CreneauOccupe[];
  rdvByClient?: Record<number, PortalRdv[]>;
  chantiersByClient?: Record<number, PortalChantier[]>;
}

// Fake en mémoire de la planification portail (occupations, RDV créés/listés, chantiers+suivi).
export class PortalSchedulingReaderFake implements IPortalSchedulingReader {
  readonly created: PortalRdv[] = [];
  private occupied: CreneauOccupe[];
  private rdvByClient: Record<number, PortalRdv[]>;
  private chantiersByClient: Record<number, PortalChantier[]>;
  private seq = 1;

  constructor(state: SchedulingFakeState = {}) {
    this.occupied = state.occupied ?? [];
    this.rdvByClient = state.rdvByClient ?? {};
    this.chantiersByClient = state.chantiersByClient ?? {};
  }

  async getCreneauxOccupes(_ctx: TenantContext, _debut: Date, _fin: Date): Promise<CreneauOccupe[]> {
    return this.occupied;
  }

  async createRdv(_ctx: TenantContext, data: CreateRdvData): Promise<PortalRdv> {
    const rdv: PortalRdv = { id: this.seq++, titre: data.titre, description: data.description ?? null, dateProposee: data.dateProposee, dureeEstimee: data.dureeEstimee, statut: "en_attente", motifRefus: null, urgence: data.urgence, createdAt: new Date() };
    this.created.push(rdv);
    (this.rdvByClient[data.clientId] ??= []).unshift(rdv);
    return rdv;
  }

  async getRdvByClient(_ctx: TenantContext, clientId: number): Promise<PortalRdv[]> {
    return this.rdvByClient[clientId] ?? [];
  }

  async getChantiersWithSuivi(_ctx: TenantContext, clientId: number): Promise<PortalChantier[]> {
    return this.chantiersByClient[clientId] ?? [];
  }
}

import type { TenantContext } from "../../../shared/tenant";
import type { IPortalDocsReader, PortalContrat, PortalDevis, PortalFacture, PortalIntervention } from "../application/portal-docs-reader";

export interface PortalDocsFakeState {
  devis?: Record<number, PortalDevis[]>;
  factures?: Record<number, PortalFacture[]>;
  interventions?: Record<number, PortalIntervention[]>;
  contrats?: Record<number, PortalContrat[]>;
}

// Fake en mémoire des lectures de documents du portail (indexé par clientId).
export class PortalDocsReaderFake implements IPortalDocsReader {
  constructor(private readonly state: PortalDocsFakeState = {}) {}
  async listDevis(_ctx: TenantContext, clientId: number): Promise<PortalDevis[]> {
    return this.state.devis?.[clientId] ?? [];
  }
  async listFactures(_ctx: TenantContext, clientId: number): Promise<PortalFacture[]> {
    return this.state.factures?.[clientId] ?? [];
  }
  async listInterventions(_ctx: TenantContext, clientId: number): Promise<PortalIntervention[]> {
    return this.state.interventions?.[clientId] ?? [];
  }
  async listContrats(_ctx: TenantContext, clientId: number): Promise<PortalContrat[]> {
    return this.state.contrats?.[clientId] ?? [];
  }
}

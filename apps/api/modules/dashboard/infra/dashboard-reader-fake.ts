import type { TenantContext } from "../../../shared/tenant";
import type { IDashboardReader } from "../application/dashboard-reader";
import type { DashClient, DashDevis, DashFacture, DashIntervention, UpcomingInterventionItem } from "../domain/dashboard";

interface TenantData {
  factures: DashFacture[];
  devis: DashDevis[];
  clients: DashClient[];
  interventions: DashIntervention[];
  objectifs: { objectifCA: string | null; objectifDevis: number | null; objectifClients: number | null };
  upcoming: UpcomingInterventionItem[];
}

const EMPTY = (): TenantData => ({ factures: [], devis: [], clients: [], interventions: [], objectifs: { objectifCA: null, objectifDevis: null, objectifClients: null }, upcoming: [] });

/*
 * Fake in-memory déterministe : lots du dashboard par tenant. Les `list*` sont supposés déjà triés
 * createdAt desc par l'appelant du seed (comme le ferait le reader réel).
 */
export class FakeDashboardReader implements IDashboardReader {
  private readonly data = new Map<number, TenantData>();

  private of(artisanId: number): TenantData {
    let d = this.data.get(artisanId);
    if (!d) {
      d = EMPTY();
      this.data.set(artisanId, d);
    }
    return d;
  }

  seed(artisanId: number, patch: Partial<TenantData>): void {
    Object.assign(this.of(artisanId), patch);
  }

  async listFactures(ctx: TenantContext): Promise<DashFacture[]> {
    return [...this.of(ctx.artisanId).factures];
  }
  async listDevis(ctx: TenantContext): Promise<DashDevis[]> {
    return [...this.of(ctx.artisanId).devis];
  }
  async listClients(ctx: TenantContext): Promise<DashClient[]> {
    return [...this.of(ctx.artisanId).clients];
  }
  async listInterventions(ctx: TenantContext): Promise<DashIntervention[]> {
    return [...this.of(ctx.artisanId).interventions];
  }
  async getObjectifs(ctx: TenantContext): Promise<{ objectifCA: string | null; objectifDevis: number | null; objectifClients: number | null }> {
    return this.of(ctx.artisanId).objectifs;
  }
  async getUpcomingInterventions(ctx: TenantContext): Promise<UpcomingInterventionItem[]> {
    return [...this.of(ctx.artisanId).upcoming];
  }
}

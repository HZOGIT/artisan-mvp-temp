import type { TenantContext } from "../../../shared/tenant";
import type { CreateArriveeData, IInterventionMobileRepository, UpdateArriveeData, UpdateDepartData } from "../application/intervention-mobile-repository";
import type { InterventionMobile } from "../domain/intervention-mobile";

/** Fake en mémoire de `interventions_mobile` (une ligne au plus par interventionId). */
export class InterventionMobileRepositoryFake implements IInterventionMobileRepository {
  rows: InterventionMobile[];
  private seq: number;
  constructor(seed: InterventionMobile[] = []) {
    this.rows = [...seed];
    this.seq = seed.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  }

  async getByIntervention(_ctx: TenantContext, interventionId: number): Promise<InterventionMobile | null> {
    return this.rows.find((r) => r.interventionId === interventionId) ?? null;
  }

  async getManyByInterventions(_ctx: TenantContext, ids: readonly number[]): Promise<Map<number, InterventionMobile>> {
    const map = new Map<number, InterventionMobile>();
    for (const r of this.rows) if (ids.includes(r.interventionId)) map.set(r.interventionId, r);
    return map;
  }

  async createArrivee(_ctx: TenantContext, data: CreateArriveeData): Promise<InterventionMobile> {
    const row: InterventionMobile = {
      id: this.seq++,
      interventionId: data.interventionId,
      heureArrivee: data.heureArrivee,
      heureDepart: null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      notesIntervention: null,
      signatureClient: null,
      signatureDate: null,
    };
    this.rows.push(row);
    return row;
  }

  async updateArrivee(_ctx: TenantContext, id: number, data: UpdateArriveeData): Promise<InterventionMobile> {
    const i = this.rows.findIndex((r) => r.id === id);
    this.rows[i] = { ...this.rows[i], heureArrivee: data.heureArrivee, latitude: data.latitude ?? null, longitude: data.longitude ?? null };
    return this.rows[i];
  }

  async updateDepart(_ctx: TenantContext, id: number, data: UpdateDepartData): Promise<void> {
    const i = this.rows.findIndex((r) => r.id === id);
    if (i >= 0) {
      this.rows[i] = {
        ...this.rows[i],
        heureDepart: data.heureDepart,
        notesIntervention: data.notesIntervention ?? null,
        signatureClient: data.signatureClient ?? null,
        signatureDate: data.signatureDate ?? null,
      };
    }
  }
}

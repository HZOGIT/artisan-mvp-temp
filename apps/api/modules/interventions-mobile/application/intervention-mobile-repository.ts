import type { TenantContext } from "../../../shared/tenant";
import type { InterventionMobile } from "../domain/intervention-mobile";

export interface CreateArriveeData {
  readonly interventionId: number;
  readonly heureArrivee: Date;
  readonly latitude?: string;
  readonly longitude?: string;
}

export interface UpdateArriveeData {
  readonly heureArrivee: Date;
  readonly latitude?: string;
  readonly longitude?: string;
}

export interface UpdateDepartData {
  readonly heureDepart: Date;
  readonly notesIntervention?: string;
  readonly signatureClient?: string;
  readonly signatureDate?: Date;
}

// Port du repository des données mobiles d'intervention (`interventions_mobile`, SOUS RLS → l'impl
// scope via withTenant + artisanId à l'insertion). Une ligne au plus par intervention.
export interface IInterventionMobileRepository {
  getByIntervention(ctx: TenantContext, interventionId: number): Promise<InterventionMobile | null>;
  // Lecture en lot (anti N+1 pour l'enrichissement de la liste du jour) : map interventionId → données.
  getManyByInterventions(ctx: TenantContext, interventionIds: readonly number[]): Promise<Map<number, InterventionMobile>>;
  createArrivee(ctx: TenantContext, data: CreateArriveeData): Promise<InterventionMobile>;
  updateArrivee(ctx: TenantContext, id: number, data: UpdateArriveeData): Promise<InterventionMobile>;
  updateDepart(ctx: TenantContext, id: number, data: UpdateDepartData): Promise<void>;
}

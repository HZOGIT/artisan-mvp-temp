import type { TenantContext } from "../../../shared/tenant";
import type { IAlertesPrevisionsRepository, InsertHistoriqueData } from "../application/alertes-previsions-repository";
import type { AlerteConfig, AlerteHistorique, AlerteType, SaveAlerteConfigInput } from "../domain/alerte-prevision";

export interface AlertesFakeState {
  config?: AlerteConfig | null;
  previsionCA?: number | null;
  caRealise?: number;
  historique?: AlerteHistorique[];
}

/** Fake en mémoire du repository alertes-prévisions (scope tenant implicite — un seul tenant par fake). */
export class AlertesPrevisionsRepositoryFake implements IAlertesPrevisionsRepository {
  config: AlerteConfig | null;
  previsionCA: number | null;
  caRealise: number;
  historique: AlerteHistorique[];
  private seq = 1;

  constructor(state: AlertesFakeState = {}) {
    this.config = state.config ?? null;
    this.previsionCA = state.previsionCA ?? null;
    this.caRealise = state.caRealise ?? 0;
    this.historique = state.historique ?? [];
  }

  async getConfig(_ctx: TenantContext): Promise<AlerteConfig | null> {
    return this.config;
  }

  async upsertConfig(_ctx: TenantContext, patch: SaveAlerteConfigInput): Promise<AlerteConfig | null> {
    const base: AlerteConfig = this.config ?? {
      seuilAlertePositif: null, seuilAlerteNegatif: null, alerteEmail: null, alerteSms: null,
      emailDestination: null, telephoneDestination: null, frequenceVerification: null, actif: null,
    };
    this.config = { ...base, ...patch };
    return this.config;
  }

  async listHistorique(_ctx: TenantContext): Promise<AlerteHistorique[]> {
    return [...this.historique].sort((a, b) => b.dateEnvoi.getTime() - a.dateEnvoi.getTime()).slice(0, 100);
  }

  async getPrevisionCA(_ctx: TenantContext, _mois: number, _annee: number): Promise<number | null> {
    return this.previsionCA;
  }

  async getCaRealiseMois(_ctx: TenantContext, _mois: number, _annee: number): Promise<number> {
    return this.caRealise;
  }

  async historiqueExiste(_ctx: TenantContext, mois: number, annee: number, typeAlerte: AlerteType): Promise<boolean> {
    return this.historique.some((h) => h.mois === mois && h.annee === annee && h.typeAlerte === typeAlerte);
  }

  async insertHistorique(_ctx: TenantContext, data: InsertHistoriqueData): Promise<AlerteHistorique> {
    const row: AlerteHistorique = { id: this.seq++, dateEnvoi: new Date(), ...data };
    this.historique.push(row);
    return row;
  }
}

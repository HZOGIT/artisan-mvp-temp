import type { TenantContext } from "../../../shared/tenant";
import type { CreateExportData, IIntegrationsComptablesRepository, UpdateExportData } from "../application/integrations-comptables-repository";
import type { ConfigComptable, ExportComptableRow, FactureIIF, SaveConfigInput, SaveSyncConfigInput } from "../domain/integration-comptable";

const EMPTY_CONFIG: ConfigComptable = {
  logiciel: null, formatExport: null, compteVentes: null, compteTVACollectee: null, compteClients: null, compteAchats: null, compteTVADeductible: null, compteFournisseurs: null,
  compteBanque: null, compteCaisse: null, journalVentes: null, journalAchats: null, journalBanque: null, prefixeFacture: null, prefixeAvoir: null, exerciceDebut: null, actif: null,
  syncAutoFactures: null, syncAutoPaiements: null, frequenceSync: null, heureSync: null, notifierErreurs: null, notifierSucces: null, derniereSync: null, prochainSync: null,
};

export interface IntegrationFakeState {
  config?: ConfigComptable | null;
  facturesIIF?: FactureIIF[];
}

// Fake en mémoire des intégrations comptables (config + exports + factures IIF).
export class IntegrationsComptablesRepositoryFake implements IIntegrationsComptablesRepository {
  config: ConfigComptable | null;
  readonly exports: ExportComptableRow[] = [];
  private facturesIIF: FactureIIF[];
  private seq = 1;

  constructor(state: IntegrationFakeState = {}) {
    this.config = state.config ?? null;
    this.facturesIIF = state.facturesIIF ?? [];
  }

  async getConfig(_ctx: TenantContext): Promise<ConfigComptable | null> {
    return this.config;
  }
  async saveConfig(_ctx: TenantContext, patch: SaveConfigInput | SaveSyncConfigInput): Promise<ConfigComptable | null> {
    this.config = { ...(this.config ?? EMPTY_CONFIG), ...(patch as Partial<ConfigComptable>) };
    return this.config;
  }
  async listExports(_ctx: TenantContext): Promise<ExportComptableRow[]> {
    return [...this.exports].sort((a, b) => b.id - a.id);
  }
  async createExport(_ctx: TenantContext, data: CreateExportData): Promise<ExportComptableRow> {
    const row: ExportComptableRow = { id: this.seq++, logiciel: data.logiciel, formatExport: data.formatExport, periodeDebut: data.periodeDebut, periodeFin: data.periodeFin, nombreEcritures: data.nombreEcritures ?? 0, montantTotal: null, statut: data.statut ?? "en_cours", erreur: null, createdAt: new Date() };
    this.exports.push(row);
    return row;
  }
  async updateExport(_ctx: TenantContext, exportId: number, data: UpdateExportData): Promise<void> {
    const i = this.exports.findIndex((e) => e.id === exportId);
    if (i >= 0) this.exports[i] = { ...this.exports[i], ...data };
  }
  async listFacturesForIIF(_ctx: TenantContext, _d: Date, _f: Date): Promise<FactureIIF[]> {
    return this.facturesIIF;
  }
}

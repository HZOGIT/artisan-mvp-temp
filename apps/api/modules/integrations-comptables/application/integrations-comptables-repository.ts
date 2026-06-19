import type { TenantContext } from "../../../shared/tenant";
import type { ConfigComptable, ExportComptableRow, FactureIIF, SaveConfigInput, SaveSyncConfigInput } from "../domain/integration-comptable";

export interface CreateExportData {
  readonly logiciel: string;
  readonly formatExport: string;
  readonly periodeDebut: string;
  readonly periodeFin: string;
  readonly nombreEcritures?: number;
  readonly statut?: string;
}

export interface UpdateExportData {
  readonly statut?: string;
  readonly nombreEcritures?: number;
  readonly erreur?: string | null;
}

/*
 * Port du repository des intégrations comptables. Tables `configurations_comptables` /
 * `exports_comptables` SOUS RLS (artisanId via withTenant). Upsert config whitelisté. Lecture des
 * factures pour l'IIF (lecture seule, scopée tenant).
 */
export interface IIntegrationsComptablesRepository {
  getConfig(ctx: TenantContext): Promise<ConfigComptable | null>;
  saveConfig(ctx: TenantContext, patch: SaveConfigInput | SaveSyncConfigInput): Promise<ConfigComptable | null>;
  listExports(ctx: TenantContext): Promise<ExportComptableRow[]>;
  createExport(ctx: TenantContext, data: CreateExportData): Promise<ExportComptableRow>;
  updateExport(ctx: TenantContext, exportId: number, data: UpdateExportData): Promise<void>;
  /** Factures de la période (statuts hors brouillon/annulee) pour l'export IIF. */
  listFacturesForIIF(ctx: TenantContext, dateDebut: Date, dateFin: Date): Promise<FactureIIF[]>;

  /*
   * ── Synchronisation ──
   * Historique d'export récent (= exports, 50 derniers, plus récents d'abord) — sert de journal de sync.
   */
  listSyncLogs(ctx: TenantContext): Promise<ExportComptableRow[]>;
  /*
   * Factures à synchroniser : statuts validee/envoyee/payee/en_retard NON couvertes par un export
   * `termine` chevauchant leur date (NOT EXISTS corrélé, limite 200).
   */
  listPendingItems(ctx: TenantContext): Promise<PendingItem[]>;
  /** Met à jour `derniereSync` de la config (NOW). */
  touchDerniereSync(ctx: TenantContext, now: Date): Promise<void>;
}

/** Item en attente de synchro (facture non encore exportée). */
export interface PendingItem {
  readonly id: number;
  readonly numero: string | null;
  readonly dateFacture: Date;
  readonly totalTTC: string | null;
  readonly statut: string | null;
}

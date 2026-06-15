import type { TenantContext } from "../../../shared/tenant";
import type { IIntegrationsComptablesRepository } from "./integrations-comptables-repository";
import type { ConfigComptable, ExportComptableRow, FormatExport, LogicielComptable, SaveConfigInput, SaveSyncConfigInput } from "../domain/integration-comptable";
import { buildIIF, deriveSyncStatus } from "../domain/integration-comptable";

export function getConfig(repo: IIntegrationsComptablesRepository, ctx: TenantContext): Promise<ConfigComptable | null> {
  return repo.getConfig(ctx);
}

export function saveConfig(repo: IIntegrationsComptablesRepository, ctx: TenantContext, input: SaveConfigInput): Promise<ConfigComptable | null> {
  return repo.saveConfig(ctx, input);
}

export function saveSyncConfig(repo: IIntegrationsComptablesRepository, ctx: TenantContext, input: SaveSyncConfigInput): Promise<ConfigComptable | null> {
  return repo.saveConfig(ctx, input);
}

export async function getSyncStatus(repo: IIntegrationsComptablesRepository, ctx: TenantContext): Promise<{ actif: boolean; derniereSync: Date | null; prochainSync: Date | null }> {
  return deriveSyncStatus(await repo.getConfig(ctx));
}

export function getExports(repo: IIntegrationsComptablesRepository, ctx: TenantContext): Promise<ExportComptableRow[]> {
  return repo.listExports(ctx);
}

export interface GenererExportInput {
  readonly logiciel: LogicielComptable;
  readonly formatExport: FormatExport;
  readonly dateDebut: string;
  readonly dateFin: string;
}

export interface GenererExportDeps {
  readonly repo: IIntegrationsComptablesRepository;
  // Contenu FEC opposable (réutilise le générateur du domaine comptabilité — invariant Σdébit=Σcrédit).
  readonly fec: { getFecContent(ctx: TenantContext, period: { dateDebut: Date; dateFin: Date }): Promise<string> };
}

// Génère un export comptable (FEC opposable réutilisé du domaine compta, ou IIF QuickBooks porté pur).
// Crée l'enregistrement d'export, génère le contenu (LECTURE SEULE — aucune écriture mutée), met à jour
// le statut. Formats `qbo`/`csv` non implémentés (parité legacy : contenu vide). Parité `genererExport`.
export async function genererExport(deps: GenererExportDeps, ctx: TenantContext, input: GenererExportInput): Promise<{ id: number; contenu: string }> {
  const dateDebut = new Date(input.dateDebut);
  const dateFin = new Date(input.dateFin);

  const exportRecord = await deps.repo.createExport(ctx, {
    logiciel: input.logiciel,
    formatExport: input.formatExport,
    periodeDebut: dateDebut.toISOString().slice(0, 10),
    periodeFin: dateFin.toISOString().slice(0, 10),
    statut: "en_cours",
  });

  let contenu = "";
  if (input.formatExport === "fec") {
    contenu = await deps.fec.getFecContent(ctx, { dateDebut, dateFin });
  } else if (input.formatExport === "iif") {
    const factures = await deps.repo.listFacturesForIIF(ctx, dateDebut, dateFin);
    contenu = buildIIF(factures);
  }

  await deps.repo.updateExport(ctx, exportRecord.id, { statut: "termine", nombreEcritures: contenu.split("\n").length - 1 });
  return { id: exportRecord.id, contenu };
}

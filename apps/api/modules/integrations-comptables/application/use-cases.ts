import type { TenantContext } from "../../../shared/tenant";
import { ValidationError } from "../../../shared/errors";
import type { IIntegrationsComptablesRepository, PendingItem } from "./integrations-comptables-repository";
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
// le statut. Formats `qbo`/`csv` non encore implémentés : un contenu vide est marqué `erreur` (jamais
// `termine`) et l'appel LÈVE → l'UI signale l'échec au lieu de livrer un fichier vide silencieusement.
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

  // Garde anti-échec silencieux : un format non implémenté (`csv`/`qbo`) ou une période sans contenu ne
  // doit JAMAIS produire un export `termine` vide (le comptable téléchargerait un fichier vide en croyant
  // l'export réussi). On marque l'export en erreur et on lève — l'échec devient visible.
  if (!contenu.trim()) {
    await deps.repo.updateExport(ctx, exportRecord.id, { statut: "erreur", erreur: `Aucun contenu à exporter pour le format « ${input.formatExport} »` });
    throw new ValidationError(`L'export au format « ${input.formatExport} » n'a produit aucun contenu (format non disponible ou période sans écriture).`);
  }

  await deps.repo.updateExport(ctx, exportRecord.id, { statut: "termine", nombreEcritures: contenu.split("\n").length - 1 });
  return { id: exportRecord.id, contenu };
}

// ── Synchronisation ──
export function getSyncLogs(repo: IIntegrationsComptablesRepository, ctx: TenantContext): Promise<ExportComptableRow[]> {
  return repo.listSyncLogs(ctx);
}

export interface PendingItemsResult {
  readonly facturesEnAttente: number;
  readonly paiementsEnAttente: number;
  readonly erreurs: number;
  readonly items: PendingItem[];
}

// Items en attente de synchro. ⚠️ On renvoie l'OBJET attendu par le client (`facturesEnAttente`/
// `paiementsEnAttente`/`erreurs`/`items`) — corrige le legacy qui renvoyait un tableau nu (le client
// lisait `.facturesEnAttente`/`.items` → toujours 0/aucun item, bug latent). Comportement intentionnel.
export async function getPendingItems(repo: IIntegrationsComptablesRepository, ctx: TenantContext): Promise<PendingItemsResult> {
  const items = await repo.listPendingItems(ctx);
  return { facturesEnAttente: items.length, paiementsEnAttente: 0, erreurs: 0, items };
}

// Synchronisation manuelle (parité legacy `lancerSync`) : config requise ; sinon, crée 1 export
// `termine` couvrant [début du mois courant, aujourd'hui] avec le logiciel/format de la config pour
// les items en attente, et met à jour `derniereSync`. Aucune écriture comptable mutée.
export async function lancerSync(repo: IIntegrationsComptablesRepository, ctx: TenantContext, now: Date = new Date()): Promise<{ success: boolean; nbItems: number; message: string }> {
  const config = await repo.getConfig(ctx);
  if (!config) return { success: false, nbItems: 0, message: "Configuration absente" };
  const items = await repo.listPendingItems(ctx);
  if (items.length === 0) return { success: true, nbItems: 0, message: "Rien a synchroniser" };
  const debutMois = new Date(now.getFullYear(), now.getMonth(), 1);
  await repo.createExport(ctx, {
    logiciel: config.logiciel || "sage",
    formatExport: config.formatExport || "fec",
    periodeDebut: debutMois.toISOString().slice(0, 10),
    periodeFin: now.toISOString().slice(0, 10),
    nombreEcritures: items.length,
    statut: "termine",
  });
  await repo.touchDerniereSync(ctx, now);
  return { success: true, nbItems: items.length, message: `${items.length} ecritures synchronisees` };
}

// Re-marque un export en erreur comme terminé (scopé tenant). NB : version SAINE — le legacy avait un
// bug de passage d'argument (artisanId utilisé comme exportId) ; ici on cible bien l'export `exportId`.
export async function retrySync(repo: IIntegrationsComptablesRepository, ctx: TenantContext, exportId: number): Promise<{ success: true }> {
  await repo.updateExport(ctx, exportId, { statut: "termine", erreur: null });
  return { success: true };
}

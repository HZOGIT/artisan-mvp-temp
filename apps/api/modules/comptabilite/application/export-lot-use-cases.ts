import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { PdfPort } from "../../../shared/ports/pdf";
import type { StoragePort } from "../../../shared/ports/storage";
import { generateFacturXML } from "../../../shared/pdf/facturx";
import { ymdCompact } from "../domain/csv-export";

/*
 * Exports en lot (ZIP par période) — parité legacy `/api/comptabilite/export-pdf-lot` et
 * `export-facturx-lot`. On sélectionne les factures du tenant SUR la période (bornes incluses),
 * en EXCLUANT `brouillon` et `annulee` (parité legacy), puis on génère pour chacune le PDF facture
 * ou le XML CII Factur-X. Les use-cases sont PURS (renvoient la liste d'entrées + le nom d'archive) :
 * l'assemblage ZIP (archiver, infra) reste à l'interface. 404 si aucune facture sur la période.
 */

/** Sous-ensemble du domaine Facture nécessaire à la sélection (le lister renvoie le domaine complet). */
interface FactureLotItem {
  readonly id: number;
  readonly numero: string | null;
  readonly clientId: number;
  readonly dateFacture: Date;
  readonly statut: string;
  readonly pdfStorageKey?: string | null;
}

export interface ExportLotReaderDeps {
  readonly factureLister: { list(ctx: TenantContext): Promise<readonly FactureLotItem[]> };
  readonly factureReader: {
    listLignes(ctx: TenantContext, id: number): Promise<unknown[]>;
    listLignesByFactureIds(ctx: TenantContext, ids: number[]): Promise<readonly { factureId: number }[]>;
  };
  readonly clientReader: {
    getById(ctx: TenantContext, id: number): Promise<{ nom?: string | null } | null>;
    listByIds(ctx: TenantContext, ids: number[]): Promise<readonly { id: number; nom?: string | null }[]>;
  };
  readonly artisanReader: { getProfile(ctx: TenantContext): Promise<unknown | null> };
}
export interface ExportLotPdfDeps extends ExportLotReaderDeps {
  readonly pdf: PdfPort;
  /** Optionnel : si présent et pdfStorageKey posé, sert le PDF stocké sans régénérer. */
  readonly storage?: StoragePort;
}

export interface LotEntry {
  readonly name: string;
  readonly content: string | Buffer;
}
export interface LotResult {
  readonly entries: readonly LotEntry[];
  readonly filename: string;
}

/** Période demandée (query). Défaut : année courante (1er janvier → aujourd'hui), bornes incluses. */
export interface PeriodInput {
  readonly dateDebut?: Date;
  readonly dateFin?: Date;
}

function resolvePeriod(p: PeriodInput, now: Date): { debut: Date; fin: Date } {
  const debut = p.dateDebut ?? new Date(now.getFullYear(), 0, 1);
  const fin = p.dateFin ? new Date(p.dateFin) : new Date(now);
  /** borne de fin incluse jusqu'à la fin de journée (parité legacy) */
  fin.setHours(23, 59, 59, 999);
  return { debut, fin };
}

/** Nom de fichier sûr depuis le nom client (parité legacy : caractères hors [a-zA-Z0-9À-ÿ_-] → `_`). */
function sanitizeName(nom: string | null | undefined): string {
  return (nom || "Client").replace(/[^a-zA-Z0-9À-ÿ_-]/g, "_");
}

async function selectFactures(deps: ExportLotReaderDeps, ctx: TenantContext, period: PeriodInput, now: Date) {
  const { debut, fin } = resolvePeriod(period, now);
  const all = await deps.factureLister.list(ctx);
  const factures = all.filter((f) => {
    const d = new Date(f.dateFacture);
    return d >= debut && d <= fin && f.statut !== "brouillon" && f.statut !== "annulee";
  });
  if (factures.length === 0) throw new NotFoundError("Aucune facture sur cette période");
  return { factures, debut, fin };
}

async function loadArtisan(deps: ExportLotReaderDeps, ctx: TenantContext): Promise<unknown> {
  const artisan = await deps.artisanReader.getProfile(ctx);
  if (!artisan) throw new NotFoundError("Profil artisan introuvable");
  return artisan;
}

async function bulkLoad(deps: ExportLotReaderDeps, ctx: TenantContext, factures: readonly FactureLotItem[]) {
  const ids = factures.map((f) => f.id);
  const clientIds = Array.from(new Set(factures.map((f) => f.clientId)));
  const [allLignes, allClients] = await Promise.all([
    deps.factureReader.listLignesByFactureIds(ctx, ids),
    deps.clientReader.listByIds(ctx, clientIds),
  ]);
  const lignesMap = new Map<number, (typeof allLignes)[number][]>();
  for (const l of allLignes) {
    const list = lignesMap.get(l.factureId) ?? [];
    list.push(l);
    lignesMap.set(l.factureId, list);
  }
  const clientsMap = new Map(allClients.map((c) => [c.id, c]));
  return { lignesMap, clientsMap };
}

export async function collectFacturxLot(deps: ExportLotReaderDeps, ctx: TenantContext, period: PeriodInput, now: Date = new Date()): Promise<LotResult> {
  const { factures, debut, fin } = await selectFactures(deps, ctx, period, now);
  const [artisan, { lignesMap, clientsMap }] = await Promise.all([loadArtisan(deps, ctx), bulkLoad(deps, ctx, factures)]);
  const entries: LotEntry[] = [];
  for (const facture of factures) {
    const client = clientsMap.get(facture.clientId) ?? null;
    /* client supprimé : on saute (parité legacy) */
    if (!client) continue;
    const lignes = lignesMap.get(facture.id) ?? [];
    const xml = generateFacturXML({ ...facture, lignes } as never, artisan as never, client as never);
    entries.push({ name: `${facture.numero ?? ""}_${sanitizeName(client.nom)}.xml`, content: xml });
  }
  return { entries, filename: `FacturX_${ymdCompact(debut)}_${ymdCompact(fin)}.zip` };
}

export async function collectFacturePdfLot(deps: ExportLotPdfDeps, ctx: TenantContext, period: PeriodInput, now: Date = new Date()): Promise<LotResult> {
  const { factures, debut, fin } = await selectFactures(deps, ctx, period, now);
  const [artisan, { lignesMap, clientsMap }] = await Promise.all([loadArtisan(deps, ctx), bulkLoad(deps, ctx, factures)]);
  const entries: LotEntry[] = [];
  for (const facture of factures) {
    const client = clientsMap.get(facture.clientId) ?? null;
    if (!client) continue;
    const lignes = lignesMap.get(facture.id) ?? [];
    let buffer: Buffer | null = null;
    if (facture.pdfStorageKey && deps.storage) {
      buffer = await deps.storage.get(facture.pdfStorageKey);
    }
    if (!buffer) {
      buffer = await deps.pdf.render("facture", { facture: { ...facture, lignes }, artisan, client });
    }
    entries.push({ name: `${facture.numero ?? ""}_${sanitizeName(client.nom)}.pdf`, content: buffer });
  }
  return { entries, filename: `Factures_PDF_${ymdCompact(debut)}_${ymdCompact(fin)}.zip` };
}

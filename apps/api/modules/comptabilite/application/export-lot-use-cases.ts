import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { PdfPort } from "../../../shared/ports/pdf";
import { generateFacturXML } from "../../../shared/pdf/facturx";
import { ymdCompact } from "../domain/csv-export";

/*
 * Exports en lot (ZIP par période) — parité legacy `/api/comptabilite/export-pdf-lot` et
 * `export-facturx-lot`. On sélectionne les factures du tenant SUR la période (bornes incluses),
 * en EXCLUANT `brouillon` et `annulee` (parité legacy), puis on génère pour chacune le PDF facture
 * ou le XML CII Factur-X. Les use-cases sont PURS (renvoient la liste d'entrées + le nom d'archive) :
 * l'assemblage ZIP (archiver, infra) reste à l'interface. 404 si aucune facture sur la période.
 */

// Sous-ensemble du domaine Facture nécessaire à la sélection (le lister renvoie le domaine complet).
interface FactureLotItem {
  readonly id: number;
  readonly numero: string;
  readonly clientId: number;
  readonly dateFacture: Date;
  readonly statut: string;
}

export interface ExportLotReaderDeps {
  readonly factureLister: { list(ctx: TenantContext): Promise<readonly FactureLotItem[]> };
  readonly factureReader: { listLignes(ctx: TenantContext, id: number): Promise<unknown[]> };
  readonly clientReader: { getById(ctx: TenantContext, id: number): Promise<{ nom?: string | null } | null> };
  readonly artisanReader: { getProfile(ctx: TenantContext): Promise<unknown | null> };
}
export interface ExportLotPdfDeps extends ExportLotReaderDeps {
  readonly pdf: PdfPort;
}

export interface LotEntry {
  readonly name: string;
  readonly content: string | Buffer;
}
export interface LotResult {
  readonly entries: readonly LotEntry[];
  readonly filename: string;
}

// Période demandée (query). Défaut : année courante (1er janvier → aujourd'hui), bornes incluses.
export interface PeriodInput {
  readonly dateDebut?: Date;
  readonly dateFin?: Date;
}

function resolvePeriod(p: PeriodInput, now: Date): { debut: Date; fin: Date } {
  const debut = p.dateDebut ?? new Date(now.getFullYear(), 0, 1);
  const fin = p.dateFin ? new Date(p.dateFin) : new Date(now);
  fin.setHours(23, 59, 59, 999); // borne de fin incluse jusqu'à la fin de journée (parité legacy)
  return { debut, fin };
}

// Nom de fichier sûr depuis le nom client (parité legacy : caractères hors [a-zA-Z0-9À-ÿ_-] → `_`).
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

export async function collectFacturxLot(deps: ExportLotReaderDeps, ctx: TenantContext, period: PeriodInput, now: Date = new Date()): Promise<LotResult> {
  const { factures, debut, fin } = await selectFactures(deps, ctx, period, now);
  const artisan = await loadArtisan(deps, ctx);
  const entries: LotEntry[] = [];
  for (const facture of factures) {
    const [lignes, client] = await Promise.all([deps.factureReader.listLignes(ctx, facture.id), deps.clientReader.getById(ctx, facture.clientId)]);
    if (!client) continue; // client supprimé : on saute (parité legacy)
    const xml = generateFacturXML({ ...facture, lignes } as never, artisan as never, client as never);
    entries.push({ name: `${facture.numero}_${sanitizeName(client.nom)}.xml`, content: xml });
  }
  return { entries, filename: `FacturX_${ymdCompact(debut)}_${ymdCompact(fin)}.zip` };
}

export async function collectFacturePdfLot(deps: ExportLotPdfDeps, ctx: TenantContext, period: PeriodInput, now: Date = new Date()): Promise<LotResult> {
  const { factures, debut, fin } = await selectFactures(deps, ctx, period, now);
  const artisan = await loadArtisan(deps, ctx);
  const entries: LotEntry[] = [];
  for (const facture of factures) {
    const [lignes, client] = await Promise.all([deps.factureReader.listLignes(ctx, facture.id), deps.clientReader.getById(ctx, facture.clientId)]);
    if (!client) continue;
    const buffer = await deps.pdf.render("facture", { facture: { ...facture, lignes }, artisan, client });
    entries.push({ name: `${facture.numero}_${sanitizeName(client.nom)}.pdf`, content: buffer });
  }
  return { entries, filename: `Factures_PDF_${ymdCompact(debut)}_${ymdCompact(fin)}.zip` };
}

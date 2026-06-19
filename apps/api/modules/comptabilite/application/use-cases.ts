import type { TenantContext } from "../../../shared/tenant";
import { assembleDeclarationTVA, computeBalance, computeGrandLivre, computeRapportTVA } from "../domain/comptabilite";
import type { CompteGrandLivre, DeclarationTVADetail, Ecriture, LigneBalance, RapportTVA } from "../domain/comptabilite";
import { buildFec, fecPreview, fecFileName } from "../domain/fec";
import type { FecPreview, FecConformite } from "../domain/fec";
import { buildFacturesCsv, csvFileName } from "../domain/csv-export";
import type { IComptabiliteReader, Periode } from "./comptabilite-reader";
import type { FacturesCsvReader } from "./factures-csv-reader";

type Clock = () => Date;

// Bornes par défaut = mois courant (parité legacy : début = 1er du mois, fin = dernier jour 23:59:59).
export function resolvePeriode(input: { dateDebut?: Date; dateFin?: Date } | undefined, now: Date): Periode {
  return {
    dateDebut: input?.dateDebut ?? new Date(now.getFullYear(), now.getMonth(), 1),
    dateFin: input?.dateFin ?? new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
  };
}

export async function getGrandLivre(reader: IComptabiliteReader, ctx: TenantContext, input?: { dateDebut?: Date; dateFin?: Date }, now: Clock = () => new Date()): Promise<CompteGrandLivre[]> {
  return computeGrandLivre(await reader.listEcritures(ctx, resolvePeriode(input, now())));
}

export async function getBalance(reader: IComptabiliteReader, ctx: TenantContext, input?: { dateDebut?: Date; dateFin?: Date }, now: Clock = () => new Date()): Promise<LigneBalance[]> {
  return computeBalance(await reader.listEcritures(ctx, resolvePeriode(input, now())));
}

export async function getJournalVentes(reader: IComptabiliteReader, ctx: TenantContext, input?: { dateDebut?: Date; dateFin?: Date }, now: Clock = () => new Date()): Promise<Ecriture[]> {
  return reader.listJournalVentes(ctx, resolvePeriode(input, now()));
}

export async function getRapportTVA(reader: IComptabiliteReader, ctx: TenantContext, input?: { dateDebut?: Date; dateFin?: Date }, now: Clock = () => new Date()): Promise<RapportTVA> {
  return computeRapportTVA(await reader.listEcritures(ctx, resolvePeriode(input, now())));
}

export async function getDeclarationTVADetail(reader: IComptabiliteReader, ctx: TenantContext, input?: { dateDebut?: Date; dateFin?: Date }, now: Clock = () => new Date()): Promise<DeclarationTVADetail> {
  const brut = await reader.declarationTVADetail(ctx, resolvePeriode(input, now()));
  return assembleDeclarationTVA(brut.parTaux, brut.tvaDeductible);
}

/*
 * Aperçu FEC (15 premières lignes + conformité) : génère le FEC complet (PUR) puis projette. Lecture
 * seule ; l'invariant Σdébit=Σcrédit est porté par `buildFec` (vérifiable via `conformite.equilibre`).
 */
export async function getFecPreview(reader: IComptabiliteReader, ctx: TenantContext, input?: { dateDebut?: Date; dateFin?: Date }, now: Clock = () => new Date()): Promise<FecPreview> {
  const p = resolvePeriode(input, now());
  const [fecData, config, siret] = await Promise.all([reader.fecInput(ctx, p), reader.fecConfig(ctx), reader.siret(ctx)]);
  return fecPreview(buildFec(fecData, config), siret);
}

/*
 * Période FEC par défaut = ANNÉE fiscale courante (1er janvier → maintenant, fin de journée) — parité
 * legacy `/api/comptabilite/fec` (≠ resolvePeriode mensuel).
 */
function resolvePeriodeFec(input: { dateDebut?: Date; dateFin?: Date } | undefined, now: Date): Periode {
  const dateFin = input?.dateFin ? new Date(input.dateFin) : new Date(now);
  dateFin.setHours(23, 59, 59, 999);
  return { dateDebut: input?.dateDebut ?? new Date(now.getFullYear(), 0, 1), dateFin };
}

export interface FecExport {
  readonly content: string;
  readonly conformite: FecConformite;
  readonly fileName: string;
}

/*
 * Export FEC fichier (parité legacy `/api/comptabilite/fec`) : génère le FEC complet (PUR, invariant
 * Σdébit=Σcrédit via `conformite.equilibre`) + le nom de fichier réglementaire. Lecture seule.
 */
export async function getFecExport(reader: IComptabiliteReader, ctx: TenantContext, input?: { dateDebut?: Date; dateFin?: Date }, now: Clock = () => new Date()): Promise<FecExport> {
  const p = resolvePeriodeFec(input, now());
  const [fecData, config, siret] = await Promise.all([reader.fecInput(ctx, p), reader.fecConfig(ctx), reader.siret(ctx)]);
  const result = buildFec(fecData, config);
  return { content: result.content, conformite: result.conformite, fileName: fecFileName(siret, p.dateFin) };
}

export interface CsvExport {
  readonly content: string;
  readonly fileName: string;
}

/*
 * Export CSV des factures de la période (parité legacy `/api/comptabilite/export-csv`). Lecture seule ;
 * même période par défaut que le FEC (année fiscale). Anti-injection CSV porté par `buildFacturesCsv`.
 */
export async function getFacturesCsvExport(reader: FacturesCsvReader, ctx: TenantContext, input?: { dateDebut?: Date; dateFin?: Date }, now: Clock = () => new Date()): Promise<CsvExport> {
  const p = resolvePeriodeFec(input, now());
  const rows = await reader.listFacturesPeriode(ctx, p);
  return { content: buildFacturesCsv(rows), fileName: csvFileName(p.dateDebut, p.dateFin) };
}

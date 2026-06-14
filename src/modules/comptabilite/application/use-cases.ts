import type { TenantContext } from "../../../shared/tenant";
import { assembleDeclarationTVA, computeBalance, computeGrandLivre, computeRapportTVA } from "../domain/comptabilite";
import type { CompteGrandLivre, DeclarationTVADetail, Ecriture, LigneBalance, RapportTVA } from "../domain/comptabilite";
import { buildFec, fecPreview } from "../domain/fec";
import type { FecPreview } from "../domain/fec";
import type { IComptabiliteReader, Periode } from "./comptabilite-reader";

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

// Aperçu FEC (15 premières lignes + conformité) : génère le FEC complet (PUR) puis projette. Lecture
// seule ; l'invariant Σdébit=Σcrédit est porté par `buildFec` (vérifiable via `conformite.equilibre`).
export async function getFecPreview(reader: IComptabiliteReader, ctx: TenantContext, input?: { dateDebut?: Date; dateFin?: Date }, now: Clock = () => new Date()): Promise<FecPreview> {
  const p = resolvePeriode(input, now());
  const [fecData, config, siret] = await Promise.all([reader.fecInput(ctx, p), reader.fecConfig(ctx), reader.siret(ctx)]);
  return fecPreview(buildFec(fecData, config), siret);
}

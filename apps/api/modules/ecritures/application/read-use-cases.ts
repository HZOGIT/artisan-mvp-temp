import type { TenantContext } from "../../../shared/tenant";
import type { IEcritureRepository } from "./ecriture-repository";
import type { EcritureComptable } from "../domain/ecriture";
import { calculerBalance, grandLivre, type LigneBalance, type LigneGrandLivre } from "./balance";
import { exporterFEC } from "./fec";

/*
 * Use-cases de lecture — purs, le repository est injecté. Le scoping tenant est porté par le
 * `TenantContext` (le repo l'applique). La lecture d'écritures d'une facture inconnue/hors tenant
 * renvoie simplement [] (pas de NotFound : une absence d'écriture n'est pas une erreur métier).
 */

export function listEcritures(repo: IEcritureRepository, ctx: TenantContext): Promise<EcritureComptable[]> {
  return repo.list(ctx);
}

export function listEcrituresFacture(
  repo: IEcritureRepository,
  ctx: TenantContext,
  factureId: number,
): Promise<EcritureComptable[]> {
  return repo.listByFacture(ctx, factureId);
}

/** Balance générale du tenant (agrégat par compte). Lecture seule scopée tenant. */
export async function balanceComptable(repo: IEcritureRepository, ctx: TenantContext): Promise<LigneBalance[]> {
  return calculerBalance(await repo.list(ctx));
}

/** Grand livre du tenant (optionnellement filtré sur un compte), avec solde progressif. */
export async function grandLivreComptable(
  repo: IEcritureRepository,
  ctx: TenantContext,
  numeroCompte?: string,
): Promise<LigneGrandLivre[]> {
  return grandLivre(await repo.list(ctx), numeroCompte);
}

/*
 * Export FEC (format légal DGFiP) du tenant, sur une période [debut, fin] inclusive. ⚠️ Dette :
 * le filtrage par période est fait en mémoire (`repo.list` puis filtre) — pour de gros volumes,
 * introduire un `repo.listEntreDates(ctx, debut, fin)` dédié (noté au journal).
 */
export async function genererExportFEC(
  repo: IEcritureRepository,
  ctx: TenantContext,
  debut: Date,
  fin: Date,
): Promise<string> {
  const dans = (await repo.list(ctx)).filter(
    (e) => e.dateEcriture.getTime() >= debut.getTime() && e.dateEcriture.getTime() <= fin.getTime(),
  );
  return exporterFEC(dans);
}

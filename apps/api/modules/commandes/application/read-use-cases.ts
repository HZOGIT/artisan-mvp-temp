import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { ICommandeRepository } from "./commande-repository";
import type { Commande, LigneCommande } from "../domain/commande";

/*
 * Use-cases de lecture — purs, le repository est injecté. Le scoping tenant est porté par
 * le `TenantContext` (le repo l'applique). `getCommande` sur une ressource d'un autre
 * tenant → le repo renvoie null → NotFoundError (ne révèle pas l'existence).
 */

export function listCommandes(repo: ICommandeRepository, ctx: TenantContext): Promise<Commande[]> {
  return repo.list(ctx);
}

export async function getCommande(repo: ICommandeRepository, ctx: TenantContext, id: number): Promise<Commande> {
  const commande = await repo.getById(ctx, id);
  if (!commande) throw new NotFoundError("Commande introuvable");
  return commande;
}

/** Lignes d'une commande — [] si la commande n'appartient pas au tenant (lecture sans oracle). */
export function listLignesCommande(
  repo: ICommandeRepository,
  ctx: TenantContext,
  commandeId: number,
): Promise<LigneCommande[]> {
  return repo.listLignes(ctx, commandeId);
}

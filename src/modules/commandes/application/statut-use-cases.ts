import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { ICommandeRepository } from "./commande-repository";
import type { Commande, CommandeStatut } from "../domain/commande";

// Use-cases dérivés (transitions de statut + retard) — purs, repository injecté. Scopés
// tenant ; une opération sur une commande hors tenant lève NotFoundError.

export async function changerStatutCommande(
  repo: ICommandeRepository,
  ctx: TenantContext,
  id: number,
  statut: CommandeStatut,
  dateLivraisonReelle?: Date | null,
): Promise<Commande> {
  const updated = await repo.updateStatut(ctx, id, statut, dateLivraisonReelle);
  if (!updated) throw new NotFoundError("Commande introuvable");
  return updated;
}

// Indicateur lecture seule : commandes en retard de livraison du tenant.
export function listerCommandesEnRetard(repo: ICommandeRepository, ctx: TenantContext): Promise<Commande[]> {
  return repo.listEnRetard(ctx);
}

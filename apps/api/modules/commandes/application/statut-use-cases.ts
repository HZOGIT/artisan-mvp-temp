import { NotFoundError, ValidationError, ConflictError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { ICommandeRepository, ReceptionLigne } from "./commande-repository";
import type { Commande, CommandeStatut, CommandeStatutFacturation } from "../domain/commande";

/*
 * Use-cases dérivés (transitions de statut + retard) — purs, repository injecté. Scopés
 * tenant ; une opération sur une commande hors tenant lève NotFoundError.
 */

const TRANSITIONS: Record<CommandeStatut, readonly CommandeStatut[]> = {
  brouillon: ["envoyee", "annulee"],
  envoyee: ["confirmee", "annulee"],
  confirmee: ["partiellement_livree", "livree", "annulee"],
  partiellement_livree: ["livree", "annulee"],
  livree: [],
  annulee: [],
};

export async function changerStatutCommande(
  repo: ICommandeRepository,
  ctx: TenantContext,
  id: number,
  statut: CommandeStatut,
  dateLivraisonReelle?: Date | null,
): Promise<Commande> {
  const commande = await repo.getById(ctx, id);
  if (!commande) throw new NotFoundError("Commande introuvable");
  if (!TRANSITIONS[commande.statut].includes(statut)) {
    throw new ConflictError(`Transition invalide : ${commande.statut} → ${statut}`);
  }
  const updated = await repo.updateStatut(ctx, id, statut, dateLivraisonReelle);
  if (!updated) throw new NotFoundError("Commande introuvable");
  return updated;
}

/** Indicateur lecture seule : commandes en retard de livraison du tenant. */
export function listerCommandesEnRetard(repo: ICommandeRepository, ctx: TenantContext): Promise<Commande[]> {
  return repo.listEnRetard(ctx);
}

/*
 * Enregistre la réception d'une commande. ⚠️ Domaine sensible : invariant
 * `quantiteRecue ≤ quantité commandée` validé ici (rejet, ValidationError) ; le repo
 * recalcule le statut. Une commande hors tenant → NotFoundError (anti-IDOR).
 */
export async function recevoirCommande(
  repo: ICommandeRepository,
  ctx: TenantContext,
  commandeId: number,
  receptions: ReceptionLigne[],
): Promise<Commande> {
  /** La commande (et ses lignes) doit appartenir au tenant. */
  const commande = await repo.getById(ctx, commandeId);
  if (!commande) throw new NotFoundError("Commande introuvable");

  const lignes = await repo.listLignes(ctx, commandeId);
  const quantiteParLigne = new Map(lignes.map((l) => [l.id, Number(l.quantite)]));
  for (const r of receptions) {
    if (r.quantiteRecue < 0) throw new ValidationError("Quantité reçue invalide (≥ 0 attendu)");
    const commandee = quantiteParLigne.get(r.ligneId);
    /** On ne valide que les lignes appartenant à la commande (les autres seront ignorées). */
    if (commandee !== undefined && r.quantiteRecue > commandee) {
      throw new ValidationError("Quantité reçue supérieure à la quantité commandée");
    }
  }

  const updated = await repo.recevoir(ctx, commandeId, receptions);
  if (!updated) throw new NotFoundError("Commande introuvable");
  return updated;
}

/*
 * Définit le statut de facturation (+ lien dépense optionnel, posé seulement si la dépense
 * appartient au tenant — anti-IDOR-FK). Commande hors tenant → NotFoundError.
 */
export async function definirStatutFacturation(
  repo: ICommandeRepository,
  ctx: TenantContext,
  id: number,
  statutFacturation: CommandeStatutFacturation,
  depenseId?: number | null,
): Promise<Commande> {
  const updated = await repo.setStatutFacturation(ctx, id, statutFacturation, depenseId);
  if (!updated) throw new NotFoundError("Commande introuvable");
  return updated;
}

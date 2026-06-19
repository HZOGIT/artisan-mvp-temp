import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { ICommandeRepository } from "./commande-repository";
import type { Commande, CreateCommandeInput, UpdateCommandeInput } from "../domain/commande";

const MAX_LIGNES = 500; // anti-DoS (boucle d'INSERT)

/*
 * Use-cases d'écriture — purs, repository injecté. ⚠️ Domaine sensible : les totaux sont
 * calculés côté repo (jamais via les inputs) ; `modifierCommande` ne touche que les
 * métadonnées (la modification des lignes/quantités/statuts = transitions, étape 7).
 */

export async function creerCommande(
  repo: ICommandeRepository,
  ctx: TenantContext,
  input: CreateCommandeInput,
): Promise<Commande> {
  if (!input.lignes || input.lignes.length === 0) throw new ValidationError("Au moins une ligne requise");
  if (input.lignes.length > MAX_LIGNES) throw new ValidationError(`Trop de lignes (max ${MAX_LIGNES})`);
  for (const l of input.lignes) {
    if (!l.designation?.trim()) throw new ValidationError("Désignation de ligne requise");
    if (!(Number(l.quantite) > 0)) throw new ValidationError("Quantité de ligne invalide (> 0 attendu)");
    if (l.prixUnitaire != null && Number(l.prixUnitaire) < 0) throw new ValidationError("Prix unitaire invalide");
  }
  // Le repo refuse un fournisseur hors tenant (null) → NotFound (anti-IDOR-FK).
  const commande = await repo.create(ctx, input);
  if (!commande) throw new NotFoundError("Fournisseur introuvable");
  return commande;
}

/*
 * Modifie uniquement les métadonnées (reference/notes/adresse/dateLivraison) — pas les
 * totaux ni les lignes (préservés serveur).
 */
export async function modifierCommande(
  repo: ICommandeRepository,
  ctx: TenantContext,
  id: number,
  input: UpdateCommandeInput,
): Promise<Commande> {
  const updated = await repo.update(ctx, id, input);
  if (!updated) throw new NotFoundError("Commande introuvable");
  return updated;
}

export async function supprimerCommande(repo: ICommandeRepository, ctx: TenantContext, id: number): Promise<void> {
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Commande introuvable");
}

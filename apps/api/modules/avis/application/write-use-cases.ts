import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IAvisRepository } from "./avis-repository";
import type { Avis, StatutAvis } from "../domain/avis";

/*
 * Use-cases d'écriture — purs, repository injecté. Le tenant est porté par le ctx ;
 * une opération sur l'avis d'un autre artisan (repo → null) lève NotFoundError
 * (ne révèle pas l'existence cross-tenant). Modération limitée au tenant propriétaire.
 */

const STATUTS_VALIDES: readonly StatutAvis[] = ["en_attente", "publie", "masque"];

/** Réponse publique de l'artisan à un avis. Réponse vide refusée (ValidationError). */
export async function repondreAvis(
  repo: IAvisRepository,
  ctx: TenantContext,
  id: number,
  reponse: string,
): Promise<Avis> {
  const texte = reponse?.trim();
  if (!texte) throw new ValidationError("Réponse requise");
  const updated = await repo.repondre(ctx, id, texte);
  if (!updated) throw new NotFoundError("Avis introuvable");
  return updated;
}

/** Modération : changement de statut (en_attente / publie / masque). */
export async function changerStatutAvis(
  repo: IAvisRepository,
  ctx: TenantContext,
  id: number,
  statut: StatutAvis,
): Promise<Avis> {
  if (!STATUTS_VALIDES.includes(statut)) throw new ValidationError("Statut invalide");
  const updated = await repo.changerStatut(ctx, id, statut);
  if (!updated) throw new NotFoundError("Avis introuvable");
  return updated;
}

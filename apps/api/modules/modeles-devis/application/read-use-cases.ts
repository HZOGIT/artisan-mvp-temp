import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IModeleDevisRepository } from "./modele-devis-repository";
import type { ModeleDevis, ModeleDevisLigne } from "../domain/modele-devis";

/*
 * Use-cases de lecture — purs, repository injecté. Le scoping tenant est porté par le repo.
 * `getModeleDevis` sur une ressource d'un autre tenant → repo renvoie null → NotFoundError.
 */

/** Liste « légère » (en-têtes sans lignes) ; le détail (lignes) passe par getModeleDevis. */
export function listModelesDevis(repo: IModeleDevisRepository, ctx: TenantContext): Promise<ModeleDevis[]> {
  return repo.list(ctx);
}

export async function getModeleDevis(repo: IModeleDevisRepository, ctx: TenantContext, id: number): Promise<ModeleDevis> {
  const modele = await repo.getById(ctx, id);
  if (!modele) throw new NotFoundError("Modèle de devis introuvable");
  return modele;
}

/*
 * Détail `{ modele, lignes }` (parité legacy `devis.getModeleWithLignes`) — l'agrégat porte déjà
 * ses lignes ; on expose la forme attendue par le client. 404 hors tenant.
 */
export async function getModeleDevisAvecLignes(
  repo: IModeleDevisRepository,
  ctx: TenantContext,
  modeleId: number,
): Promise<{ modele: ModeleDevis; lignes: readonly ModeleDevisLigne[] }> {
  const modele = await getModeleDevis(repo, ctx, modeleId);
  return { modele, lignes: modele.lignes };
}

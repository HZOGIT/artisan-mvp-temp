import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IFournisseurRepository } from "./fournisseur-repository";
import type { Fournisseur } from "../domain/fournisseur";

// Use-cases de lecture — purs, le repository est injecté. Le scoping tenant est porté
// par le `TenantContext` (le repo l'applique). `getFournisseur` sur une ressource d'un
// autre tenant → le repo renvoie null → NotFoundError (ne révèle pas l'existence).

export function listFournisseurs(repo: IFournisseurRepository, ctx: TenantContext): Promise<Fournisseur[]> {
  return repo.list(ctx);
}

export async function getFournisseur(
  repo: IFournisseurRepository,
  ctx: TenantContext,
  id: number,
): Promise<Fournisseur> {
  const fournisseur = await repo.getById(ctx, id);
  if (!fournisseur) throw new NotFoundError("Fournisseur introuvable");
  return fournisseur;
}

import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IDepenseRepository } from "./depense-repository";
import type { Depense } from "../domain/depense";

// Use-cases de lecture — purs, le repository est injecté. Le scoping tenant est porté par le
// `TenantContext` (le repo l'applique). `getDepense` sur une ressource d'un autre tenant → le
// repo renvoie null → NotFoundError (ne révèle pas l'existence cross-tenant).

export function listDepenses(repo: IDepenseRepository, ctx: TenantContext): Promise<Depense[]> {
  return repo.list(ctx);
}

export async function getDepense(repo: IDepenseRepository, ctx: TenantContext, id: number): Promise<Depense> {
  const depense = await repo.getById(ctx, id);
  if (!depense) throw new NotFoundError("Dépense introuvable");
  return depense;
}

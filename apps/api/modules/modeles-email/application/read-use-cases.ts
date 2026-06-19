import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IModeleEmailRepository } from "./modele-email-repository";
import type { ModeleEmail, TypeModeleEmail } from "../domain/modele-email";

/*
 * Use-cases de lecture — purs, le repository est injecté. Le scoping tenant est porté par le
 * `TenantContext` (le repo l'applique). `getModeleEmail` sur une ressource d'un autre tenant → le
 * repo renvoie null → NotFoundError (ne révèle pas l'existence cross-tenant).
 */

export function listModelesEmail(repo: IModeleEmailRepository, ctx: TenantContext): Promise<ModeleEmail[]> {
  return repo.list(ctx);
}

// Modèles filtrés par type (scopé tenant). Un type sans modèle renvoie [] (pas une erreur métier).
export function modelesParType(repo: IModeleEmailRepository, ctx: TenantContext, type: TypeModeleEmail): Promise<ModeleEmail[]> {
  return repo.listByType(ctx, type);
}

export async function getModeleEmail(repo: IModeleEmailRepository, ctx: TenantContext, id: number): Promise<ModeleEmail> {
  const modele = await repo.getById(ctx, id);
  if (!modele) throw new NotFoundError("Modèle d'email introuvable");
  return modele;
}

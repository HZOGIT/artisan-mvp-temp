import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IVehiculeRepository } from "./vehicule-repository";
import type { Vehicule } from "../domain/vehicule";

// Use-cases de lecture — purs, le repository est injecté. Le scoping tenant est porté
// par le `TenantContext` (le repo l'applique). `getVehiculeById` sur une ressource d'un
// autre tenant → le repo renvoie null → on lève NotFoundError (ne révèle pas l'existence).

export function listVehicules(repo: IVehiculeRepository, ctx: TenantContext): Promise<Vehicule[]> {
  return repo.list(ctx);
}

export async function getVehiculeById(repo: IVehiculeRepository, ctx: TenantContext, id: number): Promise<Vehicule> {
  const vehicule = await repo.getById(ctx, id);
  if (!vehicule) throw new NotFoundError("Véhicule introuvable");
  return vehicule;
}

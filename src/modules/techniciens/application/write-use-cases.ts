import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { ITechnicienRepository } from "./technicien-repository";
import type { Technicien, CreateTechnicienInput, UpdateTechnicienInput } from "../domain/technicien";

// Use-cases d'écriture — purs, repository injecté. Le tenant est porté par le ctx ;
// une opération sur une ressource hors tenant (repo → null/false) lève NotFoundError.

export async function creerTechnicien(
  repo: ITechnicienRepository,
  ctx: TenantContext,
  input: CreateTechnicienInput,
): Promise<Technicien> {
  if (!input.nom?.trim()) throw new ValidationError("Nom du technicien requis");
  return repo.create(ctx, input);
}

export async function modifierTechnicien(
  repo: ITechnicienRepository,
  ctx: TenantContext,
  id: number,
  input: UpdateTechnicienInput,
): Promise<Technicien> {
  // Un nom explicitement vidé est refusé (le legacy borne nom.min(1)).
  if (input.nom !== undefined && !input.nom.trim()) throw new ValidationError("Nom du technicien requis");
  const updated = await repo.update(ctx, id, input);
  if (!updated) throw new NotFoundError("Technicien introuvable");
  return updated;
}

export async function supprimerTechnicien(repo: ITechnicienRepository, ctx: TenantContext, id: number): Promise<void> {
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Technicien introuvable");
}

import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { ITechnicienRepository } from "./technicien-repository";
import type { Technicien, CreateTechnicienInput, UpdateTechnicienInput } from "../domain/technicien";
import type { Disponibilite, SetDisponibiliteInput } from "../domain/disponibilite";

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

// Définit une disponibilité (anti-IDOR : le repo renvoie null si le technicien n'est pas
// du tenant → NotFoundError). Valide le jour de semaine (0..6) et l'ordre des heures.
export async function definirDisponibilite(
  repo: ITechnicienRepository,
  ctx: TenantContext,
  technicienId: number,
  input: SetDisponibiliteInput,
): Promise<Disponibilite> {
  if (!Number.isInteger(input.jourSemaine) || input.jourSemaine < 0 || input.jourSemaine > 6) {
    throw new ValidationError("Jour de semaine invalide (0..6)");
  }
  if (input.heureFin <= input.heureDebut) {
    throw new ValidationError("L'heure de fin doit être après l'heure de début");
  }
  const dispo = await repo.setDisponibilite(ctx, technicienId, input);
  if (!dispo) throw new NotFoundError("Technicien introuvable");
  return dispo;
}

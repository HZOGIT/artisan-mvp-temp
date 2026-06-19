import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IVehiculeRepository } from "./vehicule-repository";
import type {
  Vehicule,
  CreateVehiculeInput,
  UpdateVehiculeInput,
  EntretienVehicule,
  CreateEntretienInput,
  AssuranceVehicule,
  CreateAssuranceInput,
  ReleveKilometrage,
  CreateKilometrageInput,
} from "../domain/vehicule";

/*
 * Use-cases d'écriture — purs, repository injecté. Le tenant est porté par le ctx ;
 * les opérations sur une ressource hors tenant (repo → null/false) lèvent NotFoundError.
 */

export async function createVehicule(
  repo: IVehiculeRepository,
  ctx: TenantContext,
  input: CreateVehiculeInput,
): Promise<Vehicule> {
  if (!input.immatriculation?.trim()) throw new ValidationError("Immatriculation requise");
  return repo.create(ctx, input);
}

export async function updateVehicule(
  repo: IVehiculeRepository,
  ctx: TenantContext,
  id: number,
  input: UpdateVehiculeInput,
): Promise<Vehicule> {
  const updated = await repo.update(ctx, id, input);
  if (!updated) throw new NotFoundError("Véhicule introuvable");
  return updated;
}

export async function deleteVehicule(repo: IVehiculeRepository, ctx: TenantContext, id: number): Promise<void> {
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Véhicule introuvable");
}

export async function enregistrerKilometrage(
  repo: IVehiculeRepository,
  ctx: TenantContext,
  id: number,
  kilometrage: number,
): Promise<Vehicule> {
  if (!Number.isInteger(kilometrage) || kilometrage < 0) {
    throw new ValidationError("Kilométrage invalide");
  }
  // L'invariant « le compteur ne recule pas » est garanti par le repo (GREATEST).
  const updated = await repo.updateKilometrage(ctx, id, kilometrage);
  if (!updated) throw new NotFoundError("Véhicule introuvable");
  return updated;
}

export async function ajouterEntretien(
  repo: IVehiculeRepository,
  ctx: TenantContext,
  vehiculeId: number,
  input: CreateEntretienInput,
): Promise<EntretienVehicule> {
  const entretien = await repo.addEntretien(ctx, vehiculeId, input);
  if (!entretien) throw new NotFoundError("Véhicule introuvable");
  return entretien;
}

export async function ajouterAssurance(
  repo: IVehiculeRepository,
  ctx: TenantContext,
  vehiculeId: number,
  input: CreateAssuranceInput,
): Promise<AssuranceVehicule> {
  const assurance = await repo.addAssurance(ctx, vehiculeId, input);
  if (!assurance) throw new NotFoundError("Véhicule introuvable");
  return assurance;
}

export async function enregistrerReleveKilometrage(
  repo: IVehiculeRepository,
  ctx: TenantContext,
  vehiculeId: number,
  input: CreateKilometrageInput,
): Promise<ReleveKilometrage> {
  if (!Number.isInteger(input.kilometrage) || input.kilometrage < 0) {
    throw new ValidationError("Kilométrage invalide");
  }
  const releve = await repo.addKilometrage(ctx, vehiculeId, input);
  if (!releve) throw new NotFoundError("Véhicule introuvable");
  return releve;
}

import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { ICongeRepository } from "./conge-repository";
import type { Conge, CreateCongeInput, UpdateCongeInput } from "../domain/conge";

// Use-cases d'écriture — purs, repository injecté. Validation des dates + ⚠️ **garde
// anti-IDOR-FK** : une demande ne peut viser qu'un technicien (demandeur) du tenant.
// Le workflow d'approbation (statut/validePar/solde) est porté séparément.

function assertDatesCoherentes(dateDebut?: string, dateFin?: string): void {
  // Dates au format ISO `YYYY-MM-DD` → comparaison lexicographique = chronologique.
  if (dateDebut && dateFin && dateFin < dateDebut) {
    throw new ValidationError("La date de fin doit être postérieure ou égale à la date de début");
  }
}

export async function creerConge(repo: ICongeRepository, ctx: TenantContext, input: CreateCongeInput): Promise<Conge> {
  assertDatesCoherentes(input.dateDebut, input.dateFin);
  // Anti-IDOR-FK : le technicien (demandeur) doit appartenir au tenant.
  if (!(await repo.ownsTechnicien(ctx, input.technicienId))) {
    throw new NotFoundError("Technicien introuvable");
  }
  return repo.create(ctx, input);
}

export async function modifierConge(
  repo: ICongeRepository,
  ctx: TenantContext,
  id: number,
  input: UpdateCongeInput,
): Promise<Conge> {
  assertDatesCoherentes(input.dateDebut, input.dateFin);
  const updated = await repo.update(ctx, id, input);
  if (!updated) throw new NotFoundError("Demande de congé introuvable");
  return updated;
}

export async function supprimerConge(repo: ICongeRepository, ctx: TenantContext, id: number): Promise<void> {
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Demande de congé introuvable");
}

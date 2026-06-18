import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IRdvRepository } from "./rdv-repository";
import type { CreateRdvInput, Rdv, UpdateRdvInput } from "../domain/rdv";

// Use-cases d'écriture (création / métadonnées / suppression) — purs, repository injecté.
// ⚠️ Les transitions de statut (confirmer/refuser/annuler) sont des use-cases dédiés (7/9) : elles
// ne passent pas par `modifierRdv`. Validation métier + anti-IDOR-FK sur `clientId`.

function assertDuree(dureeEstimee: number | undefined): void {
  if (dureeEstimee === undefined) return;
  if (!Number.isInteger(dureeEstimee) || dureeEstimee < 1) throw new ValidationError("La durée estimée doit être un entier ≥ 1 (minutes)");
}

export async function creerRdv(repo: IRdvRepository, ctx: TenantContext, input: CreateRdvInput): Promise<Rdv> {
  if (!input.titre?.trim()) throw new ValidationError("Le titre est requis");
  if (!(input.dateProposee instanceof Date) || Number.isNaN(input.dateProposee.getTime())) {
    throw new ValidationError("La date proposée est invalide");
  }
  assertDuree(input.dureeEstimee);
  // Anti-IDOR-FK : le client doit appartenir au tenant. NotFound (ne révèle pas l'existence cross-tenant).
  if (!(await repo.ownsClient(ctx, input.clientId))) throw new NotFoundError("Client introuvable");
  return repo.create(ctx, input); // statut="en_attente" forcé par l'infra
}

export async function modifierRdv(repo: IRdvRepository, ctx: TenantContext, id: number, input: UpdateRdvInput): Promise<Rdv> {
  if (input.titre !== undefined && !input.titre.trim()) throw new ValidationError("Le titre est requis");
  if (input.dateProposee !== undefined && (!(input.dateProposee instanceof Date) || Number.isNaN(input.dateProposee.getTime()))) {
    throw new ValidationError("La date proposée est invalide");
  }
  assertDuree(input.dureeEstimee);
  const updated = await repo.update(ctx, id, input);
  if (!updated) throw new NotFoundError("Rendez-vous introuvable");
  return updated;
}

export async function supprimerRdv(repo: IRdvRepository, ctx: TenantContext, id: number): Promise<void> {
  const ok = await repo.delete(ctx, id);
  if (!ok) throw new NotFoundError("Rendez-vous introuvable");
}

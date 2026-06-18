import { ForbiddenError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IActiviteRepository } from "./activite-repository";
import type { Activite, CreateActiviteInput } from "../domain/activite";

// Normalise une échéance ISO (YYYY-MM-DD ou datetime) en date pure YYYY-MM-DD. Rejette une date
// invalide (la colonne `echeance` est NOT NULL — parité legacy « Échéance invalide » → 400).
function normaliserEcheance(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) throw new ValidationError("Échéance invalide");
  return d.toISOString().slice(0, 10);
}

export function listActivites(repo: IActiviteRepository, ctx: TenantContext): Promise<Activite[]> {
  return repo.list(ctx);
}

// Crée une activité : normalise l'échéance, et si un rattachement entité est fourni, vérifie qu'elle
// appartient au tenant (anti-IDOR FK — parité legacy « Entité rattachée non autorisée » → 403).
export async function creerActivite(repo: IActiviteRepository, ctx: TenantContext, input: CreateActiviteInput): Promise<Activite> {
  const echeance = normaliserEcheance(input.echeance);
  const entiteType = input.entiteType ?? "aucun";
  const entiteId = input.entiteId ?? null;
  if (entiteId != null && entiteType !== "aucun") {
    if (!(await repo.ownsEntite(ctx, entiteType, entiteId))) {
      throw new ForbiddenError("Entité rattachée non autorisée");
    }
  } else if (entiteId != null && entiteType === "aucun") {
    // Rattachement incohérent (id sans type) → on neutralise l'id (cohérence du couple type/id).
    return repo.create(ctx, { ...input, echeance, entiteType: "aucun", entiteId: null });
  }
  return repo.create(ctx, { ...input, echeance, entiteType, entiteId });
}

// Bascule fait/à-faire. Parité legacy : UPDATE scopé tenant, **succès idempotent** même si l'id
// n'existe pas / appartient à un autre tenant (no-op scopé, aucune fuite). Le booléen du repo (ligne
// réellement affectée) sert l'assertion d'isolation cross-tenant dans les tests, pas le contrat HTTP.
export async function basculerFait(repo: IActiviteRepository, ctx: TenantContext, id: number, fait: boolean): Promise<{ success: true }> {
  await repo.setFait(ctx, id, fait);
  return { success: true };
}

// Suppression scopée tenant, **succès idempotent** (parité legacy : DELETE WHERE id ET artisanId).
export async function supprimerActivite(repo: IActiviteRepository, ctx: TenantContext, id: number): Promise<{ success: true }> {
  await repo.remove(ctx, id);
  return { success: true };
}

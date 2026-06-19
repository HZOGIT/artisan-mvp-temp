import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IChantierRepository } from "./chantier-repository";
import type { ChantierPhase, CreatePhaseInput, UpdatePhaseInput } from "../domain/chantier";

/*
 * Use-cases « phases de chantier » (planification/découpage en lots). ⚠️ `phases_chantier` n'a
 * **pas d'artisanId** (ni RLS) → toute opération **DOIT** vérifier l'ownership du **chantier parent**
 * avant d'agir (anti-IDOR). Pour update/delete (entrée = `id` de la phase seul), on lit d'abord la
 * phase (non scopée) pour récupérer son `chantierId`, puis on vérifie que ce chantier est au tenant.
 */

/** Normalise/valide une date optionnelle (YYYY-MM-DD). undefined → undefined ; null → null. */
function normDate(s: string | null | undefined, champ: string): string | null | undefined {
  if (s === undefined || s === null) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new ValidationError(`${champ} invalide`);
  return d.toISOString().slice(0, 10);
}

/** Phases d'un chantier possédé (404 sinon), triées par ordre. */
export async function getPhasesChantier(repo: IChantierRepository, ctx: TenantContext, chantierId: number): Promise<ChantierPhase[]> {
  if (!(await repo.getById(ctx, chantierId))) throw new NotFoundError("Chantier introuvable");
  return repo.listPhases(ctx, chantierId);
}

export type CreerPhaseInput = CreatePhaseInput;

/** Crée une phase sous un chantier possédé (404 sinon). Dates prévisionnelles validées/normalisées. */
export async function creerPhase(repo: IChantierRepository, ctx: TenantContext, input: CreerPhaseInput): Promise<ChantierPhase> {
  if (!(await repo.getById(ctx, input.chantierId))) throw new NotFoundError("Chantier introuvable");
  return repo.addPhase(ctx, {
    ...input,
    dateDebutPrevue: normDate(input.dateDebutPrevue, "Date de début prévue"),
    dateFinPrevue: normDate(input.dateFinPrevue, "Date de fin prévue"),
  });
}

/*
 * Met à jour une phase (par id). Anti-IDOR : la phase doit exister (404) ET son chantier parent
 * appartenir au tenant (404 sinon — la table phases n'est pas scopée tenant).
 */
export async function modifierPhase(
  repo: IChantierRepository,
  ctx: TenantContext,
  id: number,
  input: UpdatePhaseInput,
): Promise<ChantierPhase> {
  const phase = await repo.getPhaseById(ctx, id);
  if (!phase) throw new NotFoundError("Phase introuvable");
  if (!(await repo.getById(ctx, phase.chantierId))) throw new NotFoundError("Phase introuvable");
  const updated = await repo.updatePhase(ctx, id, {
    ...input,
    dateDebutReelle: normDate(input.dateDebutReelle, "Date de début réelle"),
    dateFinReelle: normDate(input.dateFinReelle, "Date de fin réelle"),
  });
  if (!updated) throw new NotFoundError("Phase introuvable");
  return updated;
}

/** Supprime une phase (par id). Même garde anti-IDOR via le chantier parent. */
export async function supprimerPhase(repo: IChantierRepository, ctx: TenantContext, id: number): Promise<void> {
  const phase = await repo.getPhaseById(ctx, id);
  if (!phase) throw new NotFoundError("Phase introuvable");
  if (!(await repo.getById(ctx, phase.chantierId))) throw new NotFoundError("Phase introuvable");
  await repo.deletePhase(ctx, id);
}

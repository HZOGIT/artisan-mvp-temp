import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IChantierRepository } from "./chantier-repository";
import type { ChantierSuivi, CreateSuiviInput, UpdateSuiviInput } from "../domain/chantier";

/*
 * Use-cases « suivi de chantier » (avancement/jalons). ⚠️ `suivi_chantier` n'a **pas d'artisanId**
 * (ni RLS) → toute opération **DOIT** vérifier l'ownership du **chantier parent** avant d'agir
 * (anti-IDOR). Pour update/delete (entrée = `id` du suivi seul), on lit d'abord le suivi (non scopé)
 * pour récupérer son `chantierId`, puis on vérifie que ce chantier appartient au tenant.
 */

/** Normalise/valide une date optionnelle (YYYY-MM-DD). undefined → undefined ; null → null. */
function normDate(s: string | null | undefined, champ: string): string | null | undefined {
  if (s === undefined || s === null) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new ValidationError(`${champ} invalide`);
  return d.toISOString().slice(0, 10);
}

/** Étapes de suivi d'un chantier possédé (404 sinon). */
export async function getSuiviChantier(repo: IChantierRepository, ctx: TenantContext, chantierId: number): Promise<ChantierSuivi[]> {
  if (!(await repo.getById(ctx, chantierId))) throw new NotFoundError("Chantier introuvable");
  return repo.listSuivi(ctx, chantierId);
}

export type CreerSuiviInput = CreateSuiviInput;

/** Crée une étape de suivi sous un chantier possédé (404 sinon). Dates validées/normalisées. */
export async function creerSuivi(repo: IChantierRepository, ctx: TenantContext, input: CreerSuiviInput): Promise<ChantierSuivi> {
  if (!(await repo.getById(ctx, input.chantierId))) throw new NotFoundError("Chantier introuvable");
  return repo.addSuivi(ctx, {
    ...input,
    dateDebut: normDate(input.dateDebut, "Date de début"),
    dateFin: normDate(input.dateFin, "Date de fin"),
  });
}

/*
 * Met à jour une étape de suivi (par id). Anti-IDOR : le suivi doit exister (404) ET son chantier
 * parent appartenir au tenant (404 sinon — la table suivi n'est pas scopée tenant).
 */
export async function modifierSuivi(
  repo: IChantierRepository,
  ctx: TenantContext,
  id: number,
  input: UpdateSuiviInput,
): Promise<ChantierSuivi> {
  const suivi = await repo.getSuiviById(ctx, id);
  if (!suivi) throw new NotFoundError("Suivi introuvable");
  if (!(await repo.getById(ctx, suivi.chantierId))) throw new NotFoundError("Suivi introuvable");
  const updated = await repo.updateSuivi(ctx, id, {
    ...input,
    dateDebut: normDate(input.dateDebut, "Date de début"),
    dateFin: normDate(input.dateFin, "Date de fin"),
  });
  if (!updated) throw new NotFoundError("Suivi introuvable");
  return updated;
}

/** Supprime une étape de suivi (par id). Même garde anti-IDOR via le chantier parent. */
export async function supprimerSuivi(repo: IChantierRepository, ctx: TenantContext, id: number): Promise<void> {
  const suivi = await repo.getSuiviById(ctx, id);
  if (!suivi) throw new NotFoundError("Suivi introuvable");
  if (!(await repo.getById(ctx, suivi.chantierId))) throw new NotFoundError("Suivi introuvable");
  await repo.deleteSuivi(ctx, id);
}

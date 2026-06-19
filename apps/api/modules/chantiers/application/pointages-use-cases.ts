import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IChantierRepository } from "./chantier-repository";
import type { ChantierPointage } from "../domain/chantier";

/*
 * Use-cases « pointages de chantier » (saisie de temps). Purs (repo injecté). ⚠️ Anti-IDOR : toute
 * opération exige l'ownership du **chantier parent** (404 sinon). À l'ajout, `technicienId` est
 * **validé anti-IDOR-FK** : un technicien hors tenant est **ignoré** (→ null), pas lié (parité legacy).
 */

// Pointages d'un chantier (ownership chantier requis → 404 sinon).
export async function getPointagesChantier(repo: IChantierRepository, ctx: TenantContext, chantierId: number): Promise<ChantierPointage[]> {
  if (!(await repo.getById(ctx, chantierId))) throw new NotFoundError("Chantier introuvable");
  return repo.listPointages(ctx, chantierId);
}

// Entrée d'ajout (heures déjà borné/format au routeur ; date string validée ici).
export interface AjouterPointageInput {
  readonly chantierId: number;
  readonly phaseId?: number | null;
  readonly technicienId?: number | null;
  readonly date: string;
  readonly heures: string;
  readonly description?: string | null;
}

/*
 * Ajoute un pointage sous un chantier possédé (404 sinon). Date invalide → 400. `technicienId` lié
 * seulement s'il appartient au tenant (sinon null — parité legacy, pas d'erreur).
 */
export async function ajouterPointage(repo: IChantierRepository, ctx: TenantContext, input: AjouterPointageInput): Promise<ChantierPointage> {
  if (!(await repo.getById(ctx, input.chantierId))) throw new NotFoundError("Chantier introuvable");
  const d = new Date(input.date);
  if (Number.isNaN(d.getTime())) throw new ValidationError("Date de pointage invalide");
  const dateYmd = d.toISOString().slice(0, 10);

  let technicienId: number | null = null;
  if (input.technicienId != null && (await repo.ownsTechnicien(ctx, input.technicienId))) {
    technicienId = input.technicienId;
  }

  const pointage = await repo.addPointage(ctx, {
    chantierId: input.chantierId,
    phaseId: input.phaseId ?? null,
    technicienId,
    date: dateYmd,
    heures: input.heures,
    description: input.description ?? null,
  });
  if (!pointage) throw new NotFoundError("Chantier introuvable");
  return pointage;
}

// Supprime un pointage (scopé chantier+tenant). Ownership chantier requis → 404. Idempotent.
export async function supprimerPointage(repo: IChantierRepository, ctx: TenantContext, chantierId: number, id: number): Promise<void> {
  if (!(await repo.getById(ctx, chantierId))) throw new NotFoundError("Chantier introuvable");
  await repo.deletePointage(ctx, chantierId, id);
}

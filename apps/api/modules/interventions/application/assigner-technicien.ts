import { NotFoundError, ForbiddenError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IInterventionRepository } from "./intervention-repository";
import type { ICongeRepository } from "../../conges/application/conge-repository";
import type { Intervention } from "../domain/intervention";

/** Conflit d'agenda (NON bloquant — le client l'affiche en avertissement, l'affectation est faite). */
export interface ConflitsTechnicien {
  readonly interventions: ReadonlyArray<{ id: number; titre: string; dateDebut: Date; dateFin: Date | null }>;
  readonly conges: ReadonlyArray<{ id: number; type: string; dateDebut: string; dateFin: string }>;
}

export type InterventionAvecConflits = Intervention & { readonly conflits: ConflitsTechnicien };

const ymd = (d: Date): string => d.toISOString().slice(0, 10);

/*
 * Affecte un technicien à une intervention (parité legacy `assignerTechnicien`). ⚠️ Ownership :
 * intervention du tenant (404) + **technicien du tenant** (403, anti-IDOR-FK). Renvoie l'intervention
 * mise à jour + **conflits NON bloquants** : double-booking (interventions planifiée/en cours du même
 * technicien chevauchant la fenêtre, hors elle-même) + **congés approuvés** chevauchant. La détection
 * est best-effort (une erreur de calcul ne casse pas l'affectation — conflits vides).
 */
export async function assignerTechnicien(
  repo: IInterventionRepository,
  congeRepo: ICongeRepository,
  ctx: TenantContext,
  interventionId: number,
  technicienId: number,
): Promise<InterventionAvecConflits> {
  const intervention = await repo.getById(ctx, interventionId);
  if (!intervention) throw new NotFoundError("Intervention introuvable");
  if (!(await repo.ownsRef(ctx, "technicien", technicienId))) throw new ForbiddenError("Technicien non autorisé");

  const updated = await repo.update(ctx, interventionId, { technicienId });
  if (!updated) throw new NotFoundError("Intervention introuvable");

  let conflits: ConflitsTechnicien = { interventions: [], conges: [] };
  try {
    const debut = intervention.dateDebut;
    const fin = intervention.dateFin ?? debut;
    /** Double-booking : interventions planifiée/en cours du technicien chevauchant [debut, fin[, hors celle-ci. */
    const autres = await repo.listByTechnicien(ctx, technicienId);
    const interventionsConflits = autres
      .filter(
        (i) =>
          i.id !== interventionId &&
          (i.statut === "planifiee" || i.statut === "en_cours") &&
          i.dateDebut < fin &&
          (i.dateFin ?? i.dateDebut) > debut,
      )
      .map((i) => ({ id: i.id, titre: i.titre, dateDebut: i.dateDebut, dateFin: i.dateFin }));
    /** Congés approuvés du technicien chevauchant la période (dates YMD). */
    const debutYmd = ymd(debut);
    const finYmd = ymd(fin);
    const congesConflits = (await congeRepo.list(ctx))
      .filter((c) => c.technicienId === technicienId && c.statut === "approuve" && c.dateDebut <= finYmd && c.dateFin >= debutYmd)
      .map((c) => ({ id: c.id, type: c.type, dateDebut: c.dateDebut, dateFin: c.dateFin }));
    conflits = { interventions: interventionsConflits, conges: congesConflits };
  } catch {
    /** Détection best-effort : ne casse pas l'affectation (parité legacy try/catch). */
  }

  return { ...updated, conflits };
}

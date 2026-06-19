import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IRdvRepository } from "./rdv-repository";
import type { Rdv, RdvStatut } from "../domain/rdv";

/*
 * État machine des RDV en ligne (cœur semi-sensible). Transitions autorisées par statut courant :
 *  - en_attente → confirme | refuse | annule
 *  - confirme   → annule (on peut annuler un RDV confirmé)
 *  - refuse     → ∅ (terminal)
 *  - annule     → ∅ (terminal)
 * Toute transition hors de cette table est refusée (ConflictError : le RDV est dans un état
 * incompatible). `refuse` exige un `motifRefus`.
 */
const TRANSITIONS: Record<RdvStatut, readonly RdvStatut[]> = {
  en_attente: ["confirme", "refuse", "annule"],
  confirme: ["annule"],
  refuse: [],
  annule: [],
};

export function peutTransitionner(from: RdvStatut, to: RdvStatut): boolean {
  return TRANSITIONS[from].includes(to);
}

/*
 * Applique une transition de statut après vérification de l'ownership (scopé tenant) et de la
 * légalité de la transition. `motifRefus` n'est transmis que lorsqu'il est pertinent (refus).
 */
async function appliquerTransition(
  repo: IRdvRepository,
  ctx: TenantContext,
  id: number,
  cible: RdvStatut,
  motifRefus?: string,
): Promise<Rdv> {
  const rdv = await repo.getById(ctx, id);
  if (!rdv) throw new NotFoundError("Rendez-vous introuvable");
  if (!peutTransitionner(rdv.statut, cible)) {
    throw new ConflictError(`Transition de statut invalide depuis « ${rdv.statut} »`);
  }
  const updated = await repo.setStatut(ctx, id, cible, { motifRefus });
  if (!updated) throw new NotFoundError("Rendez-vous introuvable");
  return updated;
}

export function confirmerRdv(repo: IRdvRepository, ctx: TenantContext, id: number): Promise<Rdv> {
  return appliquerTransition(repo, ctx, id, "confirme");
}

export async function refuserRdv(repo: IRdvRepository, ctx: TenantContext, id: number, motifRefus: string): Promise<Rdv> {
  if (!motifRefus?.trim()) throw new ValidationError("Le motif de refus est requis");
  return appliquerTransition(repo, ctx, id, "refuse", motifRefus);
}

export function annulerRdv(repo: IRdvRepository, ctx: TenantContext, id: number): Promise<Rdv> {
  return appliquerTransition(repo, ctx, id, "annule");
}

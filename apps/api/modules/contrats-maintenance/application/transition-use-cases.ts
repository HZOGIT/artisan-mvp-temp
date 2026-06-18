import { ConflictError, NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IContratRepository } from "./contrat-repository";
import type { Contrat, ContratStatut } from "../domain/contrat";

// État machine des contrats de maintenance (cœur du domaine). Transitions autorisées par statut :
//  - actif    → suspendu | termine | annule
//  - suspendu → actif | termine | annule
//  - termine  → ∅ (terminal)
//  - annule   → ∅ (terminal)
// Toute transition hors de cette table est refusée (ConflictError : le contrat est dans un état
// incompatible).
const TRANSITIONS: Record<ContratStatut, readonly ContratStatut[]> = {
  actif: ["suspendu", "termine", "annule"],
  suspendu: ["actif", "termine", "annule"],
  termine: [],
  annule: [],
};

export function peutTransitionner(from: ContratStatut, to: ContratStatut): boolean {
  return TRANSITIONS[from].includes(to);
}

// Applique une transition de statut après vérification de l'ownership (scopé tenant) et de la
// légalité de la transition.
async function appliquerTransition(repo: IContratRepository, ctx: TenantContext, id: number, cible: ContratStatut): Promise<Contrat> {
  const contrat = await repo.getById(ctx, id);
  if (!contrat) throw new NotFoundError("Contrat introuvable");
  if (!peutTransitionner(contrat.statut, cible)) {
    throw new ConflictError(`Transition de statut invalide depuis « ${contrat.statut} »`);
  }
  const updated = await repo.setStatut(ctx, id, cible);
  if (!updated) throw new NotFoundError("Contrat introuvable");
  return updated;
}

export function suspendreContrat(repo: IContratRepository, ctx: TenantContext, id: number): Promise<Contrat> {
  return appliquerTransition(repo, ctx, id, "suspendu");
}

export function reactiverContrat(repo: IContratRepository, ctx: TenantContext, id: number): Promise<Contrat> {
  return appliquerTransition(repo, ctx, id, "actif");
}

export function terminerContrat(repo: IContratRepository, ctx: TenantContext, id: number): Promise<Contrat> {
  return appliquerTransition(repo, ctx, id, "termine");
}

export function annulerContrat(repo: IContratRepository, ctx: TenantContext, id: number): Promise<Contrat> {
  return appliquerTransition(repo, ctx, id, "annule");
}

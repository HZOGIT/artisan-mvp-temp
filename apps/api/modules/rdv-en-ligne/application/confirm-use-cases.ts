import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IRdvRepository } from "./rdv-repository";
import type { IInterventionRepository } from "../../interventions/application/intervention-repository";
import type { Rdv } from "../domain/rdv";

/*
 * Confirmation d'un RDV en ligne (parité client/legacy `rdv.confirm`). ⚠️ Ce n'est PAS un simple
 * changement de statut : le legacy **crée une intervention planifiée** liée au RDV puis passe le
 * statut à `confirme` avec le lien `interventionId`. Cross-domaine : compose le repo `interventions`.
 * 
 * Garde : seul un RDV `en_attente` peut être confirmé (legacy → BAD_REQUEST/400 → ValidationError).
 * Anti-IDOR : RDV hors tenant → NotFoundError/404. L'email de confirmation au client est un effet de
 * bord notification ajouté dans un slice dédié (composition clients + EmailPort).
 */
export async function confirmerRdvAvecIntervention(
  rdvRepo: IRdvRepository,
  interventionRepo: IInterventionRepository,
  ctx: TenantContext,
  rdvId: number,
): Promise<Rdv> {
  const rdv = await rdvRepo.getById(ctx, rdvId);
  if (!rdv) throw new NotFoundError("Rendez-vous introuvable");
  if (rdv.statut !== "en_attente") {
    throw new ValidationError("Ce RDV ne peut plus être confirmé");
  }

  // Intervention planifiée : début = créneau proposé, fin = début + durée estimée (minutes).
  const dateFin = new Date(rdv.dateProposee.getTime() + (rdv.dureeEstimee || 60) * 60000);
  const intervention = await interventionRepo.create(ctx, {
    clientId: rdv.clientId,
    titre: rdv.titre,
    description: rdv.description ?? undefined,
    dateDebut: rdv.dateProposee,
    dateFin,
    statut: "planifiee",
  });

  const updated = await rdvRepo.setStatut(ctx, rdvId, "confirme", { interventionId: intervention.id });
  if (!updated) throw new NotFoundError("Rendez-vous introuvable");
  return updated;
}

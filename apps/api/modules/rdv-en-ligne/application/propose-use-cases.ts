import { NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IRdvRepository } from "./rdv-repository";
import type { Rdv } from "../domain/rdv";

/** +2 ans (parité legacy) */
const MAX_FUTUR_MS = 2 * 365 * 24 * 60 * 60 * 1000;
const MOTIF_AUTRE_CRENEAU = "Creneau non disponible — un autre creneau a ete propose";

/*
 * Proposition d'un autre créneau (parité client/legacy `rdv.proposeAutreCreneau`). Refuse le RDV
 * initial et **crée un NOUVEAU RDV** au créneau proposé (mêmes client/titre/description/durée/urgence).
 * ⚠️ La date est validée AVANT toute mutation (sinon on refuserait l'ancien puis on planterait sur la
 * création → état incohérent). Bornes (parité legacy) : date invalide / passé (< début du jour) /
 * > +2 ans → ValidationError (400). Anti-IDOR : RDV hors tenant → NotFoundError (404). L'email de
 * notification au client est ajouté dans le slice email dédié.
 */
export async function proposerAutreCreneau(
  rdvRepo: IRdvRepository,
  ctx: TenantContext,
  rdvId: number,
  nouvelleDateProposee: string,
): Promise<Rdv> {
  const rdv = await rdvRepo.getById(ctx, rdvId);
  if (!rdv) throw new NotFoundError("Rendez-vous introuvable");

  const nouvelleDate = new Date(nouvelleDateProposee);
  if (Number.isNaN(nouvelleDate.getTime())) {
    throw new ValidationError("Date proposée invalide");
  }
  const debutDuJour = new Date();
  debutDuJour.setHours(0, 0, 0, 0);
  if (nouvelleDate < debutDuJour) {
    throw new ValidationError("Le créneau proposé ne peut pas être dans le passé");
  }
  if (nouvelleDate.getTime() > Date.now() + MAX_FUTUR_MS) {
    throw new ValidationError("La date proposée est trop éloignée");
  }

  /** Refuse l'ancien (motif dédié) puis crée le remplaçant (la date a déjà été validée). */
  await rdvRepo.setStatut(ctx, rdvId, "refuse", { motifRefus: MOTIF_AUTRE_CRENEAU });
  return rdvRepo.create(ctx, {
    clientId: rdv.clientId,
    titre: rdv.titre,
    description: rdv.description,
    dateProposee: nouvelleDate,
    dureeEstimee: rdv.dureeEstimee,
    urgence: rdv.urgence,
  });
}

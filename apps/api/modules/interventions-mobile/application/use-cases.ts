import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IInterventionMobileRepository } from "./intervention-mobile-repository";
import type { InterventionMobile } from "../domain/intervention-mobile";
import { bornesDuJour } from "../domain/intervention-mobile";

// Sous-ensemble des ports migrés requis (typage structurel → on passe directement les repos migrés).
export interface InterventionLite {
  readonly id: number;
  readonly clientId: number;
  readonly technicienId: number | null;
  readonly dateDebut: Date;
}
export interface InterventionsReaderForMobile {
  listJour(ctx: TenantContext, dayStart: Date, dayEnd: Date): Promise<InterventionLite[]>;
  getById(ctx: TenantContext, id: number): Promise<{ id: number } | null>;
  update(ctx: TenantContext, id: number, input: { statut: "en_cours" | "terminee" }): Promise<unknown>;
}
export interface ClientReaderForMobile {
  getById(ctx: TenantContext, id: number): Promise<unknown | null>;
}
export interface TechnicienRefForMobile {
  readonly id: number;
  readonly userId: number | null;
}
export interface TechniciensReaderForMobile {
  list(ctx: TenantContext): Promise<TechnicienRefForMobile[]>;
}

export interface InterventionsMobileDeps {
  readonly interventions: InterventionsReaderForMobile;
  readonly clients: ClientReaderForMobile;
  readonly techniciens: TechniciensReaderForMobile;
  readonly mobile: IInterventionMobileRepository;
}

export interface StartInterventionInput {
  readonly interventionId: number;
  readonly latitude?: number;
  readonly longitude?: number;
}
export interface EndInterventionInput {
  readonly interventionId: number;
  readonly notes?: string;
  readonly signatureClient?: string;
}

/*
 * Interventions du jour (parité legacy). Data-minimisation RGPD : un utilisateur de rôle `technicien`
 * LIÉ à une fiche ne voit que SES interventions assignées (sinon vue complète, behavior-preserving).
 * Enrichit chaque intervention de son client + de ses données mobiles (lecture en lot, anti N+1).
 */
export async function getTodayInterventions(deps: InterventionsMobileDeps, ctx: TenantContext, now: Date = new Date()): Promise<unknown[]> {
  const { debut, fin } = bornesDuJour(now);
  let interventions = await deps.interventions.listJour(ctx, debut, fin);

  if (ctx.role === "technicien") {
    const techs = await deps.techniciens.list(ctx);
    const monTech = techs.find((t) => t.userId === ctx.userId);
    if (monTech) interventions = interventions.filter((i) => i.technicienId === monTech.id);
  }

  const mobileMap = await deps.mobile.getManyByInterventions(ctx, interventions.map((i) => i.id));
  return Promise.all(
    interventions.map(async (i) => ({
      ...i,
      client: await deps.clients.getById(ctx, i.clientId),
      mobileData: mobileMap.get(i.id) ?? null,
    })),
  );
}

/*
 * Démarre une intervention (arrivée sur site) : ownership via getById scopé tenant (null → NotFound,
 * anti-IDOR sans oracle) ; statut → `en_cours` ; upsert des données mobiles (heure d'arrivée + géoloc).
 */
export async function startIntervention(deps: InterventionsMobileDeps, ctx: TenantContext, input: StartInterventionInput, now: Date = new Date()): Promise<InterventionMobile> {
  const intervention = await deps.interventions.getById(ctx, input.interventionId);
  if (!intervention) throw new NotFoundError("Intervention non trouvée");

  await deps.interventions.update(ctx, input.interventionId, { statut: "en_cours" });

  const latitude = input.latitude?.toString();
  const longitude = input.longitude?.toString();
  const existing = await deps.mobile.getByIntervention(ctx, input.interventionId);
  if (existing) {
    return deps.mobile.updateArrivee(ctx, existing.id, { heureArrivee: now, latitude, longitude });
  }
  return deps.mobile.createArrivee(ctx, { interventionId: input.interventionId, heureArrivee: now, latitude, longitude });
}

/*
 * Termine une intervention : ownership scopé tenant ; statut → `terminee` ; si des données mobiles
 * existent, enregistre l'heure de départ + notes + signature client (date de signature si fournie).
 */
export async function endIntervention(deps: InterventionsMobileDeps, ctx: TenantContext, input: EndInterventionInput, now: Date = new Date()): Promise<{ success: true }> {
  const intervention = await deps.interventions.getById(ctx, input.interventionId);
  if (!intervention) throw new NotFoundError("Intervention non trouvée");

  await deps.interventions.update(ctx, input.interventionId, { statut: "terminee" });

  const existing = await deps.mobile.getByIntervention(ctx, input.interventionId);
  if (existing) {
    await deps.mobile.updateDepart(ctx, existing.id, {
      heureDepart: now,
      notesIntervention: input.notes,
      signatureClient: input.signatureClient,
      signatureDate: input.signatureClient ? now : undefined,
    });
  }
  return { success: true };
}

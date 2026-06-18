import { UnauthorizedError, ValidationError, TooManyRequestsError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IPortalAccessRepository } from "./portal-access-repository";
import type { IPortalSchedulingReader, PortalChantier, PortalRdv } from "./portal-scheduling-reader";
import { computeCreneauxLibres, validerDateRdv } from "../domain/portal-scheduling";

const FENETRE_MIN_MS = 24 * 60 * 60 * 1000;
const FENETRE_MAX_MS = 14 * 24 * 60 * 60 * 1000;

export interface PortalSchedulingDeps {
  readonly access: Pick<IPortalAccessRepository, "resolveByToken">;
  readonly scheduling: IPortalSchedulingReader;
  // Pour la notification artisan lors d'une demande de RDV.
  readonly clients: { getById(ctx: TenantContext, id: number): Promise<{ nom: string; prenom: string | null } | null> };
  readonly notifications: { creer(ctx: TenantContext, input: { type: "info"; titre: string; message: string; lien: string }): Promise<unknown> };
  readonly rateLimiter: { check(key: string): Promise<boolean> };
}

async function resolve(deps: { access: Pick<IPortalAccessRepository, "resolveByToken"> }, token: string, now: Date): Promise<{ ctx: TenantContext; clientId: number; artisanId: number }> {
  const access = await deps.access.resolveByToken(token, now);
  if (!access) throw new UnauthorizedError("Accès non autorisé");
  return { ctx: { artisanId: access.artisanId, userId: 0 }, clientId: access.clientId, artisanId: access.artisanId };
}

// Créneaux libres proposables au client (fenêtre [+24h, +14j], jours ouvrés 8-17, hors occupations).
export async function getCreneauxDisponibles(deps: PortalSchedulingDeps, token: string, now: Date = new Date()): Promise<string[]> {
  const { ctx } = await resolve(deps, token, now);
  const debut = new Date(now.getTime() + FENETRE_MIN_MS);
  const fin = new Date(now.getTime() + FENETRE_MAX_MS);
  const occupied = await deps.scheduling.getCreneauxOccupes(ctx, debut, fin);
  return computeCreneauxLibres(occupied, now);
}

export interface DemanderRdvInput {
  readonly titre: string;
  readonly description?: string;
  readonly urgence: "normale" | "urgente" | "tres_urgente";
  readonly dateProposee: string;
}

// Crée une demande de RDV (public, anti-flood par artisan:client) + notifie l'artisan. Date validée
// (≥ +24h, ≤ +2 ans, non NaN). Statut/durée par défaut posés à l'insertion (parité legacy).
export async function demanderRdv(deps: PortalSchedulingDeps, token: string, input: DemanderRdvInput, now: Date = new Date()): Promise<PortalRdv> {
  const { ctx, clientId, artisanId } = await resolve(deps, token, now);
  if (!(await deps.rateLimiter.check(`portal-rdv:${artisanId}:${clientId}`))) {
    throw new TooManyRequestsError("Trop de demandes. Réessayez dans quelques minutes.");
  }
  const dateProposee = new Date(input.dateProposee);
  switch (validerDateRdv(dateProposee, now)) {
    case "invalide":
      throw new ValidationError("Date proposée invalide");
    case "trop_tot":
      throw new ValidationError("Le creneau doit etre au moins 24h a l'avance");
    case "trop_loin":
      throw new ValidationError("La date proposée est trop éloignée");
  }

  const rdv = await deps.scheduling.createRdv(ctx, { clientId, titre: input.titre, description: input.description, urgence: input.urgence, dateProposee, dureeEstimee: 60 });

  const client = await deps.clients.getById(ctx, clientId);
  const clientName = client ? `${client.prenom || ""} ${client.nom || ""}`.trim() || "Un client" : "Un client";
  await deps.notifications.creer(ctx, {
    type: "info",
    titre: `Nouvelle demande de RDV de ${clientName}`,
    message: `${input.titre} — ${dateProposee.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}`,
    lien: "/rdv-en-ligne",
  });
  return rdv;
}

export async function getMesRdv(deps: Pick<PortalSchedulingDeps, "access" | "scheduling">, token: string, now: Date = new Date()): Promise<PortalRdv[]> {
  const { ctx, clientId } = await resolve(deps, token, now);
  return deps.scheduling.getRdvByClient(ctx, clientId);
}

export async function getSuiviChantiers(deps: Pick<PortalSchedulingDeps, "access" | "scheduling">, token: string, now: Date = new Date()): Promise<PortalChantier[]> {
  const { ctx, clientId } = await resolve(deps, token, now);
  return deps.scheduling.getChantiersWithSuivi(ctx, clientId);
}

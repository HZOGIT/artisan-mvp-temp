import { NotFoundError, ValidationError, TooManyRequestsError } from "../../../shared/errors";
import type { EmailPort } from "../../../shared/ports/email";
import type { RateLimiterPort } from "../../../shared/ports/rate-limiter";
import type { TenantContext } from "../../../shared/tenant";
import type { ArtisanReader } from "../../../shared/readers/contact-readers";
import type { IDemandeAvisRepository } from "./demande-avis-repository";
import type { ClientRef, DemandeAvis, InterventionRef } from "../domain/demande-avis";

/*
 * Dépendances injectées du workflow demande d'avis. `lienBaseUrl` vient d'une source de
 * confiance (APP_URL), jamais du header Origin. `genererToken`/`maintenant` injectables
 * pour des tests déterministes (défaut : uuid v4 + horloge système).
 */
export interface DemandeAvisDeps {
  readonly repo: IDemandeAvisRepository;
  readonly email: EmailPort;
  readonly rateLimiter: RateLimiterPort;
  readonly lienBaseUrl: string;
  readonly genererToken?: () => string;
  readonly maintenant?: () => Date;
  readonly artisanReader?: ArtisanReader;
}

const DUREE_VALIDITE_JOURS = 14;

function rateLimitKey(artisanId: number): string {
  /** Clé dédiée (distincte des autres envois) pour ne pas partager le quota. */
  return `avis:${artisanId}`;
}

/*
 * Crée la demande + envoie l'email. Suppose ownership déjà vérifié (client possédé,
 * email présent). Applique le rate limit AVANT tout effet de bord.
 */
async function creerEtEnvoyer(
  deps: DemandeAvisDeps,
  ctx: TenantContext,
  client: ClientRef & { email: string },
  intervention: InterventionRef,
): Promise<DemandeAvis> {
  if (!(await deps.rateLimiter.check(rateLimitKey(ctx.artisanId)))) {
    throw new TooManyRequestsError("Trop de demandes d'avis envoyées. Réessayez dans quelques minutes.");
  }

  const now = (deps.maintenant ?? (() => new Date()))();
  const token = (deps.genererToken ?? (() => crypto.randomUUID()))();
  const expiresAt = new Date(now.getTime() + DUREE_VALIDITE_JOURS * 24 * 3600 * 1000);

  const demande = await deps.repo.creerDemande(ctx, {
    clientId: client.id,
    interventionId: intervention.id,
    tokenDemande: token,
    emailEnvoyeAt: now,
    expiresAt,
  });

  const artisan = deps.artisanReader ? await deps.artisanReader.getArtisan(ctx) : null;
  const lien = `${deps.lienBaseUrl}/avis/${token}`;
  await deps.email.send({
    to: client.email,
    subject: "Votre avis nous intéresse",
    body:
      `<h2>Bonjour ${client.nom},</h2>` +
      `<p>Suite à notre intervention, votre retour nous aiderait beaucoup.</p>` +
      `<p><a href="${lien}">Donner mon avis</a></p>` +
      `<p>Ce lien est valable ${DUREE_VALIDITE_JOURS} jours.</p>`,
    fromName: artisan?.nomEntreprise ?? undefined,
    replyTo: artisan?.email ?? undefined,
  });

  return demande;
}

/** Envoie une demande d'avis pour une intervention donnée (parité legacy envoyerDemande). */
export async function envoyerDemandeAvis(
  deps: DemandeAvisDeps,
  ctx: TenantContext,
  interventionId: number,
): Promise<DemandeAvis> {
  const intervention = await deps.repo.getInterventionOwned(ctx, interventionId);
  if (!intervention) throw new NotFoundError("Intervention introuvable");

  const client = await deps.repo.getClientOwned(ctx, intervention.clientId);
  if (!client) throw new NotFoundError("Client introuvable");
  if (!client.email) throw new ValidationError("Le client n'a pas d'email");

  return creerEtEnvoyer(deps, ctx, { ...client, email: client.email }, intervention);
}

/** Envoie une demande d'avis pour un client (trouve sa dernière intervention). */
export async function envoyerDemandeAvisParClient(
  deps: DemandeAvisDeps,
  ctx: TenantContext,
  clientId: number,
): Promise<DemandeAvis> {
  const client = await deps.repo.getClientOwned(ctx, clientId);
  if (!client) throw new NotFoundError("Client introuvable");
  if (!client.email) throw new ValidationError("Le client n'a pas d'email");

  const intervention = await deps.repo.getDerniereInterventionDuClient(ctx, clientId);
  if (!intervention) throw new ValidationError("Aucune intervention trouvée pour ce client");

  return creerEtEnvoyer(deps, ctx, { ...client, email: client.email }, intervention);
}

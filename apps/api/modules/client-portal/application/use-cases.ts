import { randomUUID } from "node:crypto";
import { NotFoundError, UnauthorizedError, ValidationError, TooManyRequestsError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IPortalAccessRepository } from "./portal-access-repository";
import { buildAccessEmailBody, buildPortalUrl, clientNomComplet, computeExpiry, type ArtisanPortalInfo, type ClientPortalInfo, type PortalAccessStatus } from "../domain/portal-access";

/** Scope tenant pour les lectures résolues par token (userId non pertinent pour la RLS artisanId). */
function tokenScope(artisanId: number): TenantContext {
  return { artisanId, userId: 0 };
}

/** ── ADMIN (cookie artisan) ──────────────────────────────────────────────────── */
export interface ClientPortalAdminDeps {
  readonly access: IPortalAccessRepository;
  readonly clients: { getById(ctx: TenantContext, id: number): Promise<{ id: number; nom: string; prenom: string | null; email: string | null } | null> };
  readonly email: { send(message: { to: string; subject: string; body: string }): Promise<void> };
  readonly rateLimiter: { check(key: string): Promise<boolean> };
  /** Générateur de token (injecté pour la testabilité) — défaut : UUID v4. */
  readonly genToken?: () => string;
}

/*
 * Génère un lien d'accès au portail pour un client du tenant et l'envoie par email. Ownership scopé
 * tenant (404 anti-IDOR), email requis (400), anti-abus par artisan (429). Token UUID, validité 90 j.
 */
export async function generateAccess(deps: ClientPortalAdminDeps, ctx: TenantContext, clientId: number, origin: string, now: Date = new Date()): Promise<{ url: string; token: string }> {
  const client = await deps.clients.getById(ctx, clientId);
  if (!client) throw new NotFoundError("Client introuvable");
  if (!client.email) throw new ValidationError("Le client n'a pas d'adresse email");
  if (!(await deps.rateLimiter.check(`portal:${ctx.artisanId}`))) {
    throw new TooManyRequestsError("Trop d'envois d'accès portail. Réessayez dans quelques minutes.");
  }

  const token = (deps.genToken ?? randomUUID)();
  const expiresAt = computeExpiry(now);
  await deps.access.createAccess(ctx, { clientId: client.id, token, email: client.email, expiresAt });

  const artisan = await deps.access.getArtisanPublic(ctx.artisanId);
  const portalUrl = buildPortalUrl(origin, token);
  await deps.email.send({
    to: client.email,
    subject: `${artisan?.nomEntreprise || "Votre artisan"} — Accès à votre espace client`,
    body: buildAccessEmailBody(artisan?.nomEntreprise || "Votre artisan", clientNomComplet(client.prenom, client.nom), portalUrl),
  });
  return { url: portalUrl, token };
}

export function getStatus(deps: { access: IPortalAccessRepository }, ctx: TenantContext, clientId: number): Promise<PortalAccessStatus | null> {
  return deps.access.getStatusByClientId(ctx, clientId);
}

export async function deactivate(deps: { access: IPortalAccessRepository }, ctx: TenantContext, clientId: number): Promise<{ success: true }> {
  await deps.access.deactivateByClientId(ctx, clientId);
  return { success: true };
}

/** ── PUBLIC (token) ──────────────────────────────────────────────────────────── */
export interface VerifyAccessResult {
  readonly valid: boolean;
  readonly client: Omit<ClientPortalInfo, never> | null;
  readonly artisan: ArtisanPortalInfo | null;
}

/*
 * Vérifie un token portail : invalide/expiré → {valid:false}. Sinon rafraîchit le dernier accès et
 * renvoie l'identité client + artisan (capacité = token, pas de cookie).
 */
export async function verifyAccess(deps: { access: IPortalAccessRepository }, token: string, now: Date = new Date()): Promise<VerifyAccessResult> {
  const access = await deps.access.resolveByToken(token, now);
  if (!access) return { valid: false, client: null, artisan: null };

  const ctx = tokenScope(access.artisanId);
  await deps.access.touchLastAccess(ctx, access.id, now);
  const [client, artisan] = await Promise.all([deps.access.getClientInfo(ctx, access.clientId), deps.access.getArtisanPublic(access.artisanId)]);
  return { valid: true, client: client ?? null, artisan: artisan ?? null };
}

export interface ClientInfoResult {
  readonly nom: string;
  readonly prenom: string | null;
  readonly email: string | null;
  readonly telephone: string | null;
  readonly adresse: string | null;
  readonly codePostal: string | null;
  readonly ville: string | null;
  readonly artisanEmail: string | null;
}

/** Infos du client connecté au portail (token requis → 401 si invalide). null si le client n'existe plus. */
export async function getClientInfo(deps: { access: IPortalAccessRepository }, token: string, now: Date = new Date()): Promise<ClientInfoResult | null> {
  const access = await deps.access.resolveByToken(token, now);
  if (!access) throw new UnauthorizedError("Accès non autorisé");

  const ctx = tokenScope(access.artisanId);
  const [client, artisan] = await Promise.all([deps.access.getClientInfo(ctx, access.clientId), deps.access.getArtisanPublic(access.artisanId)]);
  if (!client) return null;
  return {
    nom: client.nom,
    prenom: client.prenom,
    email: client.email,
    telephone: client.telephone,
    adresse: client.adresse,
    codePostal: client.codePostal,
    ville: client.ville,
    artisanEmail: artisan?.email ?? null,
  };
}

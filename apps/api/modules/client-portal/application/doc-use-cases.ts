import { NotFoundError, TooManyRequestsError, UnauthorizedError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IPortalDevisOptionsWriter } from "./portal-devis-options-writer";
import type { IPortalAccessRepository } from "./portal-access-repository";
import type { IPortalDocsReader, PortalContrat, PortalDevis, PortalDevisOption, PortalFacture, PortalIntervention } from "./portal-docs-reader";

/*
 * Lectures de documents du portail (PUBLIC par token). Chaque proc résout l'accès par token (401 si
 * invalide/expiré) puis lit les documents du client résolu, scopés tenant + filtrés par clientId.
 */
export interface PortalDocsDeps {
  readonly access: Pick<IPortalAccessRepository, "resolveByToken">;
  readonly docs: IPortalDocsReader;
}

async function resolve(deps: PortalDocsDeps, token: string, now: Date): Promise<{ ctx: TenantContext; clientId: number }> {
  const access = await deps.access.resolveByToken(token, now);
  if (!access) throw new UnauthorizedError("Accès non autorisé");
  return { ctx: { artisanId: access.artisanId, userId: 0 }, clientId: access.clientId };
}

export async function getDevis(deps: PortalDocsDeps, token: string, now: Date = new Date()): Promise<PortalDevis[]> {
  const { ctx, clientId } = await resolve(deps, token, now);
  return deps.docs.listDevis(ctx, clientId);
}

export async function getFactures(deps: PortalDocsDeps, token: string, now: Date = new Date()): Promise<PortalFacture[]> {
  const { ctx, clientId } = await resolve(deps, token, now);
  return deps.docs.listFactures(ctx, clientId);
}

export async function getInterventions(deps: PortalDocsDeps, token: string, now: Date = new Date()): Promise<PortalIntervention[]> {
  const { ctx, clientId } = await resolve(deps, token, now);
  return deps.docs.listInterventions(ctx, clientId);
}

export async function getContrats(deps: PortalDocsDeps, token: string, now: Date = new Date()): Promise<PortalContrat[]> {
  const { ctx, clientId } = await resolve(deps, token, now);
  return deps.docs.listContrats(ctx, clientId);
}

export async function listerOptionsDevis(deps: PortalDocsDeps, token: string, devisId: number, now: Date = new Date()): Promise<PortalDevisOption[]> {
  const { ctx, clientId } = await resolve(deps, token, now);
  return deps.docs.getOptionsDevis(ctx, clientId, devisId);
}

export interface PortalOptionsMutDeps extends PortalDocsDeps {
  readonly devisOptionsWriter: IPortalDevisOptionsWriter;
  readonly rateLimiter: { check(key: string): Promise<boolean> };
}

export async function selectionnerOption(
  deps: PortalOptionsMutDeps,
  token: string,
  optionId: number,
  now: Date = new Date(),
): Promise<{ success: boolean; optionId: number }> {
  const { ctx, clientId } = await resolve(deps, token, now);
  if (!(await deps.rateLimiter.check(`portal:opt:${ctx.artisanId}:${clientId}`))) {
    throw new TooManyRequestsError("Trop de requêtes. Réessayez dans quelques minutes.");
  }
  const devisId = await deps.devisOptionsWriter.selectOptionForClient(ctx, optionId, clientId);
  if (devisId === null) throw new NotFoundError("Option non trouvée");
  return { success: true, optionId };
}

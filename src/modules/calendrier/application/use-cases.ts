import type { TenantContext } from "../../../shared/tenant";
import { icalPath } from "../domain/ical";
import type { IcalFeed } from "../domain/ical";
import type { IIcalFeedRepository, TokenGenerator } from "./ical-feed-repository";

// Renvoie le chemin du flux iCal, en générant **paresseusement** le jeton à la 1re demande (parité
// legacy `getIcalFeed` : query à effet de bord si le jeton est absent).
export async function getIcalFeed(repo: IIcalFeedRepository, genererToken: TokenGenerator, ctx: TenantContext): Promise<IcalFeed> {
  let token = await repo.getToken(ctx);
  if (!token) {
    token = genererToken();
    await repo.setToken(ctx, token);
  }
  return { path: icalPath(token) };
}

// Régénère le jeton (révoque l'ancien lien d'abonnement) et renvoie le nouveau chemin.
export async function regenerateIcalFeed(repo: IIcalFeedRepository, genererToken: TokenGenerator, ctx: TenantContext): Promise<IcalFeed> {
  const token = genererToken();
  await repo.setToken(ctx, token);
  return { path: icalPath(token) };
}

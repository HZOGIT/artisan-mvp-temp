import type { IArtisanRepository } from "../../artisan/application/artisan-repository";
import type { StripePort } from "../../../shared/ports/stripe";
import type { TenantContext } from "../../../shared/tenant";
import { NotFoundError } from "../../../shared/errors";
import { deriveConnectStatus } from "../domain/connect";

export interface ConnectDeps {
  readonly artisanRepo: IArtisanRepository;
  readonly stripe: StripePort;
  readonly appUrl: string;
}

/**
 * Crée le compte Stripe Connect si absent (idempotent), puis génère un Account Link Stripe-hosted.
 * Le lien est valide quelques minutes, usage unique — toujours créé just-in-time, jamais stocké.
 */
export async function startOnboarding(deps: ConnectDeps, ctx: TenantContext): Promise<{ url: string }> {
  const artisan = await deps.artisanRepo.getProfile(ctx);
  if (!artisan) throw new NotFoundError("Artisan introuvable");

  let accountId = artisan.stripeConnectAccountId;
  if (!accountId) {
    const account = await deps.stripe.createConnectAccount({ country: "FR", email: artisan.email });
    accountId = account.id;
    await deps.artisanRepo.updateConnectState(ctx, {
      stripeConnectAccountId: accountId,
      stripeConnectStatus: "pending",
      stripeConnectUpdatedAt: new Date(),
    });
  }

  const link = await deps.stripe.createAccountLink({
    accountId,
    refreshUrl: `${deps.appUrl}/api/paiement/connect/refresh?artisanId=${ctx.artisanId}`,
    returnUrl: `${deps.appUrl}/paiements?connect=return`,
  });
  return { url: link.url };
}

/**
 * Statut Connect du tenant courant. Quand le statut DB n'est pas 'active' et qu'un compte
 * Stripe existe, interroge Stripe en live pour se resynchroniser — cas webhook manqué ou
 * re-onboard d'un compte déjà charges_enabled (Stripe ne refire pas account.updated).
 */
export async function getConnectStatus(deps: Pick<ConnectDeps, "artisanRepo" | "stripe">, ctx: TenantContext) {
  const artisan = await deps.artisanRepo.getProfile(ctx);
  if (!artisan) throw new NotFoundError("Artisan introuvable");

  let status = artisan.stripeConnectStatus;
  let chargesEnabled = artisan.stripeConnectChargesEnabled;
  let payoutsEnabled = artisan.stripeConnectPayoutsEnabled;
  let detailsSubmitted = artisan.stripeConnectDetailsSubmitted;
  let requirements = artisan.stripeConnectRequirements;

  if (status !== "active" && artisan.stripeConnectAccountId) {
    try {
      const acct = await deps.stripe.retrieveConnectAccount(artisan.stripeConnectAccountId);
      const derived = deriveConnectStatus(acct.charges_enabled, acct.details_submitted);
      const now = new Date();
      await deps.artisanRepo.updateConnectState(ctx, {
        stripeConnectChargesEnabled: acct.charges_enabled,
        stripeConnectPayoutsEnabled: acct.payouts_enabled,
        stripeConnectDetailsSubmitted: acct.details_submitted,
        stripeConnectRequirements: acct.requirements,
        stripeConnectStatus: derived,
        stripeConnectUpdatedAt: now,
        ...(acct.charges_enabled && !artisan.stripeConnectConnectedAt ? { stripeConnectConnectedAt: now } : {}),
      });
      status = derived;
      chargesEnabled = acct.charges_enabled;
      payoutsEnabled = acct.payouts_enabled;
      detailsSubmitted = acct.details_submitted;
      requirements = acct.requirements;
    } catch {
      /* ponytail: Stripe indisponible → retour statut DB (graceful degrade) */
    }
  }

  return {
    status: status as "none" | "pending" | "active" | "restricted" | "deauthorized",
    chargesEnabled,
    detailsSubmitted,
    payoutsEnabled,
    requirements: requirements as Record<string, unknown> | null,
    accountId: artisan.stripeConnectAccountId,
    connectedAt: artisan.stripeConnectConnectedAt,
  };
}

import type { IArtisanRepository } from "../../artisan/application/artisan-repository";
import type { StripePort } from "../../../shared/ports/stripe";
import type { TenantContext } from "../../../shared/tenant";
import { NotFoundError } from "../../../shared/errors";

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

/** Statut Connect du tenant courant (source : colonnes artisan, sans appel Stripe). */
export async function getConnectStatus(deps: Pick<ConnectDeps, "artisanRepo">, ctx: TenantContext) {
  const artisan = await deps.artisanRepo.getProfile(ctx);
  if (!artisan) throw new NotFoundError("Artisan introuvable");
  return {
    status: artisan.stripeConnectStatus as "none" | "pending" | "active" | "restricted" | "deauthorized",
    chargesEnabled: artisan.stripeConnectChargesEnabled,
    detailsSubmitted: artisan.stripeConnectDetailsSubmitted,
    payoutsEnabled: artisan.stripeConnectPayoutsEnabled,
    requirements: artisan.stripeConnectRequirements as Record<string, unknown> | null,
    accountId: artisan.stripeConnectAccountId,
    connectedAt: artisan.stripeConnectConnectedAt,
  };
}

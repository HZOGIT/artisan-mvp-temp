import type { DbClient } from "../../shared/db";
import type { StripePort } from "../../shared/ports/stripe";
import type { RateLimiterPort } from "../../shared/ports/rate-limiter";
import { PortalPaymentReaderDrizzle } from "./infra/portal-payment-reader-drizzle";
import { PortalPaymentWriterDrizzle } from "./infra/portal-payment-writer-drizzle";
import { registerPaiementRoute, type PaiementRouteDeps } from "./interface/http/paiement-route";

export interface PaiementModuleDeps {
  readonly db: DbClient;
  readonly stripe: StripePort;
  readonly rateLimiter: RateLimiterPort;
  readonly appUrl: string;
}

export interface PaiementModule {
  readonly routeDeps: PaiementRouteDeps;
  readonly registerRoute: typeof registerPaiementRoute;
}

export function createPaiementModule(deps: PaiementModuleDeps): PaiementModule {
  const reader = new PortalPaymentReaderDrizzle(deps.db);
  const writer = new PortalPaymentWriterDrizzle(deps.db);
  return {
    routeDeps: { reader, writer, stripe: deps.stripe, rateLimiter: deps.rateLimiter, appUrl: deps.appUrl },
    registerRoute: registerPaiementRoute,
  };
}

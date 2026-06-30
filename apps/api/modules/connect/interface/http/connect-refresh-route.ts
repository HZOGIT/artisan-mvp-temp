import type { FastifyInstance } from "fastify";
import type { StripePort } from "../../../../shared/ports/stripe";
import type { DbClient } from "../../../../shared/db";
import { artisans } from "../../../../../../drizzle/schema.pg";
import { eq } from "drizzle-orm";

export interface ConnectRefreshRouteDeps {
  readonly stripe: StripePort;
  readonly db: DbClient;
  readonly appUrl: string;
}

/**
 * GET /api/paiement/connect/refresh?artisanId=N
 * Stripe appelle cette URL quand l'Account Link a expiré ou a déjà été visité.
 * Recrée un nouveau lien (usage unique) et redirige le navigateur de l'artisan.
 */
export function registerConnectRefreshRoute(app: FastifyInstance, deps: ConnectRefreshRouteDeps): void {
  app.get("/api/paiement/connect/refresh", async (req, reply) => {
    const artisanId = parseInt(String((req.query as { artisanId?: string }).artisanId ?? ""), 10);
    if (!Number.isFinite(artisanId) || artisanId <= 0) {
      return reply.code(400).send({ error: "artisanId manquant ou invalide" });
    }

    const [row] = await deps.db.select({ accountId: artisans.stripeConnectAccountId })
      .from(artisans)
      .where(eq(artisans.id, artisanId))
      .limit(1);

    if (!row?.accountId) {
      return reply.code(404).send({ error: "Compte Stripe Connect introuvable pour cet artisan" });
    }

    const link = await deps.stripe.createAccountLink({
      accountId: row.accountId,
      refreshUrl: `${deps.appUrl}/api/paiement/connect/refresh?artisanId=${artisanId}`,
      returnUrl: `${deps.appUrl}/parametres?tab=paiements&connect=return`,
    });

    return reply.redirect(link.url, 302);
  });
}

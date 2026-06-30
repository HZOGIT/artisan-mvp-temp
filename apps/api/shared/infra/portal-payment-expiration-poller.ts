import fp from "fastify-plugin";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import pg from "pg";
import type { FastifyInstance } from "fastify";
import type { StripePort } from "../ports/stripe";
import type { PortalPaymentWriter } from "../../modules/paiement/application/portal-payment-writer";

/* ponytail: lock distinct des autres pollers */
const LOCK_ID = BigInt("0xb111d6cc");

export interface PortalPaymentExpirationPollerOptions {
  readonly stripe: StripePort;
  readonly writer: PortalPaymentWriter;
  /** DATABASE_URL owner (bypassrls) — paiements_stripe est FORCE RLS, app_tenant sans tenant = 0 lignes. */
  readonly ownerDbUrl: string;
  readonly dbUrl: string;
}

interface PendingSession {
  readonly id: number;
  readonly artisanId: number;
  readonly stripeSessionId: string;
  readonly stripeConnectAccountId: string | null;
}

export const portalPaymentExpirationPollerPlugin = fp(
  (app: FastifyInstance, opts: PortalPaymentExpirationPollerOptions) => {
    const task = new AsyncTask(
      "portal-payment-expiration-poll",
      async () => {
        const client = new pg.Client({ connectionString: opts.ownerDbUrl });
        await client.connect();
        try {
          const { rows: lockRows } = await client.query(`SELECT pg_try_advisory_lock(${LOCK_ID}) AS acquired`);
          if (!(lockRows[0] as { acquired: boolean }).acquired) return;
          try {
            const { rows } = await client.query<PendingSession>(
              `SELECT id, "artisanId", "stripeSessionId", "stripe_connect_account_id" AS "stripeConnectAccountId"
               FROM paiements_stripe
               WHERE statut = 'en_attente'`,
            );

            let expired = 0;
            for (const row of rows) {
              try {
                const status = await opts.stripe.retrieveCheckoutSession(row.stripeSessionId, row.stripeConnectAccountId ?? undefined);
                if (status?.sessionStatus === "open") continue;
                await opts.writer.expirePaiement({ artisanId: row.artisanId, userId: 0 }, row.id);
                expired++;
                app.log.warn(
                  { event: "portal_payment_expired", paiementId: row.id, artisanId: row.artisanId },
                  `Paiement portail expiré (artisan ${row.artisanId}, paiement ${row.id})`,
                );
              } catch (err) {
                app.log.error(
                  { event: "portal_payment_expiration_item_error", paiementId: row.id, error: err instanceof Error ? err.message : String(err) },
                  "Erreur expiration paiement portail",
                );
              }
            }
            if (rows.length > 0 || expired > 0) {
              app.log.info({ event: "portal_payment_expiration_done", checked: rows.length, expired }, "Portal payment expiration terminée");
            }
          } finally {
            await client.query(`SELECT pg_advisory_unlock(${LOCK_ID})`);
          }
        } finally {
          await client.end();
        }
      },
      (err) => {
        app.log.error(
          { event: "portal_payment_expiration_error", error: err instanceof Error ? err.message : String(err) },
          "Erreur poller expiration paiements portail",
        );
      },
    );

    app.scheduler.addSimpleIntervalJob(new SimpleIntervalJob({ minutes: 10, runImmediately: false }, task));
  },
  { name: "portal-payment-expiration-poller" },
);

import fp from "fastify-plugin";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import pg from "pg";
import type { FastifyInstance } from "fastify";
import type { StripePort } from "../ports/stripe";
import type { WebhookPaymentWriter } from "../../modules/subscription/application/webhook-payment-writer";

/* ponytail: lock différent des autres pollers (outbox 0xb111d0cc, inbound 0xb111d1bb, pa-reconcil 0xb111d3cc) */
const LOCK_ID = BigInt("0xb111d5cc");
/** Délai minimal entre création et premier poll — laisse le webhook arriver en priorité. */
const MIN_AGE_SECONDS = 10 * 60;

export interface PortalPaymentReconciliationPollerOptions {
  readonly stripe: StripePort;
  readonly writer: WebhookPaymentWriter;
  readonly dbUrl: string;
  readonly genererEcritures?: (artisanId: number, factureId: number) => Promise<void>;
}

export interface OrphanedPayment {
  readonly id: number;
  readonly artisanId: number;
  readonly factureId: number;
  readonly stripeSessionId: string;
  readonly tokenPaiement: string | null;
}

export type ReconcileOutcome = "reconciled" | "not-paid" | "no-session" | "no-token";

/**
 * Réconcilie un paiement en attente : interroge Stripe et appelle completeCheckout si payé.
 * Exporté pour test L1. genererEcritures est géré par l'appelant (plugin) avec log observable.
 */
export async function reconcileOrphanedPayment(
  payment: OrphanedPayment,
  stripe: StripePort,
  writer: WebhookPaymentWriter,
): Promise<ReconcileOutcome> {
  if (!payment.tokenPaiement) return "no-token";

  const session = await stripe.retrieveCheckoutSession(payment.stripeSessionId);
  if (!session) return "no-session";
  if (session.paymentStatus !== "paid") return "not-paid";

  await writer.completeCheckout({
    artisanId: payment.artisanId,
    paiementId: payment.id,
    factureId: payment.factureId,
    stripePaymentIntentId: session.paymentIntentId ?? "",
  });

  return "reconciled";
}

export const portalPaymentReconciliationPollerPlugin = fp(
  (app: FastifyInstance, opts: PortalPaymentReconciliationPollerOptions) => {
    const task = new AsyncTask(
      "portal-payment-reconciliation-poll",
      async () => {
        const client = new pg.Client({ connectionString: opts.dbUrl });
        await client.connect();
        try {
          const { rows: lockRows } = await client.query(`SELECT pg_try_advisory_lock(${LOCK_ID}) AS acquired`);
          if (!(lockRows[0] as { acquired: boolean }).acquired) {
            app.log.debug({ event: "portal_payment_reconciliation_lock_skipped" }, "Portal payment reconciliation: lock non acquis");
            return;
          }
          try {
            const cutoff = new Date(Date.now() - MIN_AGE_SECONDS * 1000);
            const { rows } = await client.query<OrphanedPayment>(
              `SELECT id, "artisanId", "factureId", "stripeSessionId", "tokenPaiement"
               FROM paiements_stripe
               WHERE statut = 'en_attente' AND "createdAt" < $1`,
              [cutoff],
            );

            let reconciled = 0;
            for (const payment of rows) {
              try {
                const outcome = await reconcileOrphanedPayment(payment, opts.stripe, opts.writer);
                if (outcome === "reconciled") {
                  reconciled++;
                  app.log.warn(
                    { event: "portal_payment_reconciled", factureId: payment.factureId, artisanId: payment.artisanId },
                    `Paiement portail réconcilié hors-webhook (artisan ${payment.artisanId}, facture ${payment.factureId})`,
                  );
                  if (opts.genererEcritures) {
                    await opts.genererEcritures(payment.artisanId, payment.factureId).catch((err: unknown) => {
                      app.log.error(
                        { event: "portal_payment_ecritures_error", factureId: payment.factureId, artisanId: payment.artisanId, error: err instanceof Error ? err.message : String(err) },
                        "Erreur genererEcritures après réconciliation portail (best-effort compta)",
                      );
                    });
                  }
                }
              } catch (err) {
                app.log.error(
                  { event: "portal_payment_reconciliation_item_error", factureId: payment.factureId, error: err instanceof Error ? err.message : String(err) },
                  "Erreur réconciliation paiement portail",
                );
              }
            }
            if (rows.length > 0 || reconciled > 0) {
              app.log.info({ event: "portal_payment_reconciliation_done", checked: rows.length, reconciled }, "Portal payment reconciliation terminée");
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
          { event: "portal_payment_reconciliation_error", error: err instanceof Error ? err.message : String(err) },
          "Erreur poller réconciliation paiements portail",
        );
      },
    );

    app.scheduler.addSimpleIntervalJob(new SimpleIntervalJob({ seconds: 300, runImmediately: false }, task));
  },
  { name: "portal-payment-reconciliation-poller" },
);

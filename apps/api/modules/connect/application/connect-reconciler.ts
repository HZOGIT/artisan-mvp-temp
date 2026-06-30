import { sql, eq } from "drizzle-orm";
import { artisans } from "../../../../../drizzle/schema.pg";
import { runReconciler } from "../../../platform/scheduler/reconciler";
import type { Anomalie, HealResult } from "../../../platform/scheduler/reconciler";
import type { DbClient } from "../../../shared/db";
import type { JobDefinition } from "../../../platform/scheduler/scheduler-types";
import { hourlyKey } from "../../../platform/scheduler/scheduler-types";
import type { ConnectAccountData, StripePort } from "../../../shared/ports/stripe";
import { deriveConnectStatus } from "../domain/connect";

const ACTION = "healing.connect.statut-desync";
const SEUIL = 20;
const STABLE_HOURS = 6;

interface ConnectAnomalieDetails {
  readonly accountId: string;
  readonly stripe: {
    readonly chargesEnabled: boolean;
    readonly payoutsEnabled: boolean;
    readonly detailsSubmitted: boolean;
    readonly requirements: Record<string, unknown> | null;
    readonly derivedStatus: string;
  };
  readonly localBefore: {
    readonly chargesEnabled: boolean;
    readonly status: string;
  };
}

export interface ConnectReconcilerOpts {
  readonly dryRun?: boolean;
  readonly seuil?: number;
  readonly onSeuilDepasse?: (anomalies: ReadonlyArray<Anomalie>) => Promise<void>;
}

/**
 * @param ownerDb Pool owner (artisan_user) — requis pour la lecture cross-tenant d'artisans.
 */
export function createConnectReconcilerJob(
  ownerDb: DbClient,
  stripe: StripePort,
  opts: ConnectReconcilerOpts = {},
): JobDefinition {
  return {
    name: "heal:connect-statut-desync",
    periodKey: hourlyKey,
    run: async () => runConnectReconciler(ownerDb, stripe, opts),
  };
}

/** @param ownerDb Pool owner — voir createConnectReconcilerJob. */
export async function runConnectReconciler(
  ownerDb: DbClient,
  stripe: StripePort,
  opts: ConnectReconcilerOpts = {},
): Promise<void> {
  const stableBefore = new Date(Date.now() - STABLE_HOURS * 3_600_000);

  await runReconciler<ConnectAnomalieDetails>(
    ownerDb,
    async () => {
      const result = await ownerDb.execute<{
        id: number;
        account_id: string;
        charges_enabled: boolean;
        status: string;
      }>(sql`
        SELECT
          id,
          stripe_connect_account_id        AS account_id,
          stripe_connect_charges_enabled   AS charges_enabled,
          stripe_connect_status            AS status
        FROM artisans
        WHERE stripe_connect_account_id IS NOT NULL
          AND stripe_connect_status != 'deauthorized'
          AND (stripe_connect_updated_at < ${stableBefore} OR stripe_connect_updated_at IS NULL)
        ORDER BY stripe_connect_updated_at ASC NULLS FIRST
        LIMIT 20
      `);

      const anomalies: Anomalie<ConnectAnomalieDetails>[] = [];
      for (const row of result.rows) {
        let acct: ConnectAccountData;
        try {
          acct = await stripe.retrieveConnectAccount(row.account_id);
        } catch {
          /* ponytail: best-effort — Stripe API échec pour ce compte, on skip */
          continue;
        }
        const derivedStatus = deriveConnectStatus(acct.charges_enabled, acct.details_submitted);
        const desync = row.charges_enabled !== acct.charges_enabled || row.status !== derivedStatus;
        if (!desync) continue;

        anomalies.push({
          entityType: "artisan",
          entityId: row.id,
          artisanId: row.id,
          invariant: "statut-desync",
          details: {
            accountId: row.account_id,
            stripe: {
              chargesEnabled: acct.charges_enabled,
              payoutsEnabled: acct.payouts_enabled,
              detailsSubmitted: acct.details_submitted,
              requirements: acct.requirements,
              derivedStatus,
            },
            localBefore: {
              chargesEnabled: row.charges_enabled,
              status: row.status,
            },
          },
        });
      }
      return anomalies;
    },
    async (anomalie, tx): Promise<HealResult> => {
      const { stripe: s } = anomalie.details;
      const now = new Date();
      await tx.update(artisans)
        .set({
          stripeConnectChargesEnabled: s.chargesEnabled,
          stripeConnectPayoutsEnabled: s.payoutsEnabled,
          stripeConnectDetailsSubmitted: s.detailsSubmitted,
          stripeConnectRequirements: s.requirements,
          stripeConnectStatus: s.derivedStatus,
          stripeConnectUpdatedAt: now,
          ...(s.chargesEnabled ? { stripeConnectConnectedAt: now } : {}),
        })
        .where(eq(artisans.id, anomalie.entityId));
      return {
        avant: anomalie.details.localBefore,
        apres: { chargesEnabled: s.chargesEnabled, status: s.derivedStatus },
        raison: "statut-connect-resync-depuis-stripe",
      };
    },
    async (anomalie, tx): Promise<boolean> => {
      const [row] = await tx
        .select({
          status: artisans.stripeConnectStatus,
          chargesEnabled: artisans.stripeConnectChargesEnabled,
        })
        .from(artisans)
        .where(eq(artisans.id, anomalie.entityId))
        .limit(1);
      if (!row) return false;
      return (
        row.status === anomalie.details.stripe.derivedStatus &&
        row.chargesEnabled === anomalie.details.stripe.chargesEnabled
      );
    },
    {
      action: ACTION,
      dryRun: opts.dryRun ?? true,
      seuil: opts.seuil ?? SEUIL,
      onSeuilDepasse: opts.onSeuilDepasse,
    },
  );
}

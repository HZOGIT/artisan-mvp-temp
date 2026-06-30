import { eventOutbox } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../shared/db";

export interface Anomalie<TDetails = unknown> {
  readonly entityType: string;
  readonly entityId: number;
  readonly artisanId: number;
  readonly invariant: string;
  readonly details: TDetails;
}

export interface HealResult {
  readonly avant: unknown;
  readonly apres: unknown;
  readonly raison: string;
}

export interface ReconcilerOpts {
  /**
   * Action healing event (convention FR minuscule) : "healing.<module>.<invariant>".
   * Ex. : "healing.stocks.seuil-alerte", "healing.events.outbox-bloque".
   */
  readonly action: string;
  /** Dry-run par défaut : émet les healing events sans exécuter heal(). */
  readonly dryRun?: boolean;
  /** Circuit-breaker : si detect() > seuil, alerte au lieu de réparer en masse. Défaut : 50. */
  readonly seuil?: number;
  /** Callback appelé quand le seuil est dépassé. */
  readonly onSeuilDepasse?: (anomalies: ReadonlyArray<Anomalie>) => Promise<void>;
}

export interface ReconcilerResult {
  readonly detected: number;
  readonly healed: number;
  readonly failed: number;
  readonly seuilAtteint: boolean;
}

/**
 * Helper minimal pour un reconciler de données.
 *
 * Contrat :
 * - detect()    retourne les entités en dérive (fenêtrée, ne pas full-scan).
 * - heal()      forward-fix idempotent dans la tx fournie — jamais de suppression/écrasement.
 * - verify()    re-detect sur l'entité dans la même tx — doit retourner true sinon rollback.
 *
 * Chaque réparation émet un healing event dans event_outbox **dans la même transaction**
 * que le heal (atomicité garantie : soit les deux, soit rien).
 *
 * En dryRun (défaut = true) : healing events émis avec payload.dryRun=true, heal() non appelé.
 * Si detect() > seuil → onSeuilDepasse() appelé, rien réparé (circuit-breaker).
 *
 * ponytail: pas d'abstraction Reconciler<T> — helper nu. Extraire si ≥3 reconcilers réels montrent un pattern.
 */
export async function runReconciler<T>(
  db: DbClient,
  detect: () => Promise<Anomalie<T>[]>,
  heal: (anomalie: Anomalie<T>, tx: DbClient) => Promise<HealResult>,
  verify: (anomalie: Anomalie<T>, tx: DbClient) => Promise<boolean>,
  opts: ReconcilerOpts,
): Promise<ReconcilerResult> {
  const { action, dryRun = true, seuil = 50, onSeuilDepasse } = opts;

  const anomalies = await detect();
  const detected = anomalies.length;

  if (detected > seuil) {
    await onSeuilDepasse?.(anomalies);
    return { detected, healed: 0, failed: 0, seuilAtteint: true };
  }

  let healed = 0;
  let failed = 0;

  for (const anomalie of anomalies) {
    if (dryRun) {
      await db.insert(eventOutbox).values({
        artisanId: anomalie.artisanId,
        userId: null,
        entityType: anomalie.entityType,
        entityId: anomalie.entityId,
        action,
        payload: { invariant: anomalie.invariant, dryRun: true },
      });
      healed++;
      continue;
    }

    try {
      await db.transaction(async (tx) => {
        const txDb = tx as unknown as DbClient;
        const result = await heal(anomalie, txDb);
        await txDb.insert(eventOutbox).values({
          artisanId: anomalie.artisanId,
          userId: null,
          entityType: anomalie.entityType,
          entityId: anomalie.entityId,
          action,
          payload: {
            invariant: anomalie.invariant,
            avant: result.avant,
            apres: result.apres,
            raison: result.raison,
            dryRun: false,
          },
        });
        const ok = await verify(anomalie, txDb);
        if (!ok) throw new Error("verify-failed");
      });
      healed++;
    } catch {
      failed++;
    }
  }

  return { detected, healed, failed, seuilAtteint: false };
}

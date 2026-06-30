import { sql, eq } from "drizzle-orm";
import { stocks, mouvementsStock } from "../../../../../drizzle/schema.pg";
import { runReconciler } from "../../../platform/scheduler/reconciler";
import type { Anomalie, HealResult } from "../../../platform/scheduler/reconciler";
import type { DbClient } from "../../../shared/db";
import type { JobDefinition } from "../../../platform/scheduler/scheduler-types";
import { dailyKey } from "../../../platform/scheduler/scheduler-types";
import { round2 } from "../../../shared/money";

const STABLE_DELAY_MS = 5 * 60 * 1_000;
const DEFAULT_SEUIL = 50;
const DEFAULT_SEUIL_AMBIGU_QUANTITE = 10;

interface StockAnomalieDetails {
  readonly stockId: number;
  readonly quantiteEnStock: string;
  readonly lastQuantiteApres: string;
  readonly isAmbigu: boolean;
}

export interface StocksQuantiteReconcilerOpts {
  readonly dryRun?: boolean;
  readonly seuil?: number;
  /**
   * delta |quantiteEnStock - last(quantiteApres)| au-delà duquel le cas est "ambigu"
   * → file de revue manuelle, pas d'auto-fix. Défaut : 10.
   */
  readonly seuilAmbiguQuantite?: number;
  readonly onSeuilDepasse?: (anomalies: ReadonlyArray<Anomalie>) => Promise<void>;
}

async function detectAll(
  ownerDb: DbClient,
  stableDelayMs: number,
  seuilAmbiguQuantite: number,
): Promise<Anomalie<StockAnomalieDetails>[]> {
  const stableBefore = new Date(Date.now() - stableDelayMs);
  const result = await ownerDb.execute<{
    stock_id: number;
    artisan_id: number;
    quantite_en_stock: string;
    last_quantite_apres: string;
  }>(sql`
    SELECT
      s.id                                             AS stock_id,
      s."artisanId"                                    AS artisan_id,
      s."quantiteEnStock"::text                        AS quantite_en_stock,
      COALESCE(last_m."quantiteApres"::text, '0.00')   AS last_quantite_apres
    FROM stocks s
    LEFT JOIN LATERAL (
      SELECT "quantiteApres"
      FROM mouvements_stock
      WHERE "stockId" = s.id
      ORDER BY "createdAt" DESC, id DESC
      LIMIT 1
    ) last_m ON true
    WHERE s."updatedAt" < ${stableBefore}
      AND ABS(s."quantiteEnStock"::numeric - COALESCE(last_m."quantiteApres"::numeric, 0)) > 0.005
    LIMIT 100
  `);
  return result.rows.map((r) => {
    const delta = Math.abs(Number(r.quantite_en_stock) - Number(r.last_quantite_apres));
    return {
      entityType: "stock",
      entityId: r.stock_id,
      artisanId: r.artisan_id,
      invariant: "quantite-divergente",
      details: {
        stockId: r.stock_id,
        quantiteEnStock: r.quantite_en_stock,
        lastQuantiteApres: r.last_quantite_apres,
        isAmbigu: delta > seuilAmbiguQuantite,
      },
    };
  });
}

/**
 * Reconciler C5 — invariant : stocks.quantiteEnStock = dernière(mouvements_stock.quantiteApres).
 *
 * Détecte cross-tenant via ownerDb (stocks = FORCE RLS, app_tenant retourne 0 lignes sans contexte).
 * Cas non-ambigu (delta ≤ seuilAmbiguQuantite) → forward-fix + healing event "healing.stock.quantite-divergente".
 * Cas ambigu → file de revue manuelle "healing.stock.revue-requise", aucune mutation de données.
 * Dry-run par défaut : healing events dryRun:true émis, aucune mutation.
 */
export async function runStocksQuantiteReconciler(
  ownerDb: DbClient,
  opts: StocksQuantiteReconcilerOpts = {},
): Promise<void> {
  const {
    dryRun = true,
    seuil = DEFAULT_SEUIL,
    seuilAmbiguQuantite = DEFAULT_SEUIL_AMBIGU_QUANTITE,
    onSeuilDepasse,
  } = opts;

  const allAnomalies = await detectAll(ownerDb, STABLE_DELAY_MS, seuilAmbiguQuantite);

  if (allAnomalies.length > seuil) {
    await onSeuilDepasse?.(allAnomalies);
    return;
  }

  const ambiguAnomalies = allAnomalies.filter((a) => a.details.isAmbigu);
  const reparableAnomalies = allAnomalies.filter((a) => !a.details.isAmbigu);

  /* Cas ambigus (delta > seuilAmbiguQuantite) → file de revue manuelle, aucune mutation. */
  if (ambiguAnomalies.length > 0) {
    await runReconciler<StockAnomalieDetails>(
      ownerDb,
      () => Promise.resolve(ambiguAnomalies),
      (anomalie): Promise<HealResult> => Promise.resolve({
        avant: anomalie.details.quantiteEnStock,
        apres: "en-revue",
        raison: "delta-ambigu-depasse-seuil",
      }),
      (): Promise<boolean> => Promise.resolve(true),
      { action: "healing.stock.revue-requise", dryRun, seuil: ambiguAnomalies.length + 1 },
    );
  }

  /* Cas non-ambigus → forward-fix : quantiteEnStock = last(quantiteApres). */
  if (reparableAnomalies.length > 0) {
    await runReconciler<StockAnomalieDetails>(
      ownerDb,
      () => Promise.resolve(reparableAnomalies),
      async (anomalie, tx): Promise<HealResult> => {
        const { stockId, quantiteEnStock, lastQuantiteApres } = anomalie.details;
        const magnitudeDelta = round2(Math.abs(Number(lastQuantiteApres) - Number(quantiteEnStock))).toFixed(2);
        await tx
          .update(stocks)
          .set({ quantiteEnStock: lastQuantiteApres, updatedAt: new Date() })
          .where(eq(stocks.id, stockId));
        await tx.insert(mouvementsStock).values({
          stockId,
          type: "ajustement",
          quantite: magnitudeDelta,
          quantiteAvant: quantiteEnStock,
          quantiteApres: lastQuantiteApres,
          motif: "Correction reconciliation quantiteEnStock",
          reference: null,
        });
        return { avant: quantiteEnStock, apres: lastQuantiteApres, raison: "quantite-divergente-corrigee" };
      },
      async (anomalie, tx): Promise<boolean> => {
        const [row] = await tx
          .select({ qty: stocks.quantiteEnStock })
          .from(stocks)
          .where(eq(stocks.id, anomalie.details.stockId))
          .limit(1);
        if (!row) return false;
        return Math.abs(Number(row.qty) - Number(anomalie.details.lastQuantiteApres)) <= 0.005;
      },
      { action: "healing.stock.quantite-divergente", dryRun, seuil: reparableAnomalies.length + 1 },
    );
  }
}

/**
 * @param ownerDb Connexion owner/admin (artisan_user) obligatoire.
 * stocks a FORCE RLS : app_tenant voit 0 lignes sans contexte tenant, detect() serait aveugle.
 */
export function createStocksQuantiteReconcilerJob(
  ownerDb: DbClient,
  opts: StocksQuantiteReconcilerOpts = {},
): JobDefinition {
  return {
    name: "heal:stocks-quantite-divergente",
    periodKey: dailyKey,
    run: async () => runStocksQuantiteReconciler(ownerDb, opts),
  };
}

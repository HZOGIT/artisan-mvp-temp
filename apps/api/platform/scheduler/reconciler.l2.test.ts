import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { runReconciler } from "./reconciler";
import type { Anomalie, HealResult } from "./reconciler";
import { createDbClient } from "../../shared/db";
import type { DbHandle, DbClient } from "../../shared/db";

const DB_URL = process.env.DATABASE_URL;
const ACTION = "healing.test.invariant-l2";

describe.skipIf(!DB_URL)("runReconciler — L2 atomicité, dryRun, seuil", () => {
  let handle: DbHandle;
  let db: DbClient;
  let admin: Pool;

  const cleanup = () =>
    admin.query(`DELETE FROM event_outbox WHERE action = $1`, [ACTION]);

  beforeAll(async () => {
    admin = new Pool({ connectionString: DB_URL });
    handle = createDbClient(DB_URL!);
    db = handle.db;
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await admin.end();
    await handle.close();
  });

  const fakeAnomalie: Anomalie = {
    entityType: "test-l2-reconciler",
    entityId: 42,
    artisanId: 1,
    invariant: "invariant-l2",
    details: { valeur: "avant" },
  };

  const noop = async (): Promise<HealResult> => ({ avant: "old", apres: "new", raison: "test" });
  const verifyOk = async () => true;
  const verifyFail = async () => false;

  it("heal + healing event committés atomiquement quand verify passe", async () => {
    const result = await runReconciler(
      db,
      async () => [fakeAnomalie],
      noop,
      verifyOk,
      { action: ACTION, dryRun: false },
    );

    expect(result).toMatchObject({ detected: 1, healed: 1, failed: 0, seuilAtteint: false });

    const { rows } = await admin.query<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM event_outbox WHERE action = $1 AND "entityId" = 42`,
      [ACTION],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toMatchObject({ dryRun: false, avant: "old", apres: "new" });

    await cleanup();
  });

  it("rollback atomique quand verify échoue — aucun healing event dans outbox", async () => {
    const result = await runReconciler(
      db,
      async () => [fakeAnomalie],
      noop,
      verifyFail,
      { action: ACTION, dryRun: false },
    );

    expect(result).toMatchObject({ detected: 1, healed: 0, failed: 1 });

    const { rows } = await admin.query(
      `SELECT 1 FROM event_outbox WHERE action = $1`,
      [ACTION],
    );
    expect(rows).toHaveLength(0);
  });

  it("dryRun=true — healing event dryRun:true émis, heal() non appelé", async () => {
    let healCalled = 0;
    let verifyCalled = 0;

    const result = await runReconciler(
      db,
      async () => [fakeAnomalie],
      async () => { healCalled++; return { avant: "x", apres: "y", raison: "r" }; },
      async () => { verifyCalled++; return true; },
      { action: ACTION, dryRun: true },
    );

    expect(result).toMatchObject({ detected: 1, healed: 1, seuilAtteint: false });
    expect(healCalled).toBe(0);
    expect(verifyCalled).toBe(0);

    const { rows } = await admin.query<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM event_outbox WHERE action = $1 AND "entityId" = 42`,
      [ACTION],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toMatchObject({ dryRun: true, invariant: "invariant-l2" });

    await cleanup();
  });

  it("seuil dépassé — heal() non appelé, onSeuilDepasse() appelé, seuilAtteint=true", async () => {
    const anomalies: Anomalie[] = Array.from({ length: 4 }, (_, i) => ({
      ...fakeAnomalie,
      entityId: 100 + i,
    }));

    let healCalled = 0;
    let seuilAnomalies: ReadonlyArray<Anomalie> | null = null;

    const result = await runReconciler(
      db,
      async () => anomalies,
      async () => { healCalled++; return { avant: "x", apres: "y", raison: "r" }; },
      verifyOk,
      {
        action: ACTION,
        dryRun: false,
        seuil: 3,
        onSeuilDepasse: async (a) => { seuilAnomalies = a; },
      },
    );

    expect(result).toMatchObject({ detected: 4, healed: 0, failed: 0, seuilAtteint: true });
    expect(healCalled).toBe(0);
    expect(seuilAnomalies).toHaveLength(4);

    const { rows } = await admin.query(
      `SELECT 1 FROM event_outbox WHERE action = $1`,
      [ACTION],
    );
    expect(rows).toHaveLength(0);
  });
});

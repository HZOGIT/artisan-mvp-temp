import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../db";
import { runEventOutboxDrain } from "./outbox-drainer";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const TEST_ENTITY_TYPE = "test-l2-outbox-drain";

describe.skipIf(!URL)("runEventOutboxDrain — FOR UPDATE SKIP LOCKED (L2, anti-régression OPE-809)", () => {
  const admin = new Pool({ connectionString: URL });
  const h1 = createDbClient(APP_URL!);
  const h2 = createDbClient(APP_URL!);

  const cleanup = async () => {
    await admin.query("DELETE FROM event_outbox WHERE \"entityType\" = $1", [TEST_ENTITY_TYPE]);
    await admin.query("DELETE FROM events WHERE \"entityType\" = $1", [TEST_ENTITY_TYPE]);
  };

  beforeAll(async () => {
    await cleanup();
    for (let i = 0; i < 4; i++) {
      await admin.query(
        `INSERT INTO event_outbox ("artisanId", "entityType", "entityId", action) VALUES ($1, $2, $3, $4)`,
        [1, TEST_ENTITY_TYPE, i + 1, "test"],
      );
    }
  });

  afterAll(async () => {
    await cleanup();
    await admin.end();
    await h1.close();
    await h2.close();
  });

  it("deux drains concurrents n'insèrent chaque event qu'une seule fois dans event_log", async () => {
    /* drain1 est lancé en premier, drain2 démarre 5 ms après — overlap garanti → SKIP LOCKED doit évincer drain2 */
    await Promise.all([
      runEventOutboxDrain(h1.db),
      new Promise<void>((resolve) =>
        setTimeout(() => runEventOutboxDrain(h2.db).then(() => resolve()), 5),
      ),
    ]);

    const { rows } = await admin.query<{ count: string }>(
      `SELECT count(*) FROM events WHERE "entityType" = $1`,
      [TEST_ENTITY_TYPE],
    );
    expect(Number(rows[0]?.count)).toBe(4);

    const { rows: outboxRows } = await admin.query<{ count: string }>(
      `SELECT count(*) FROM event_outbox WHERE "entityType" = $1`,
      [TEST_ENTITY_TYPE],
    );
    expect(Number(outboxRows[0]?.count)).toBe(0);
  });
});

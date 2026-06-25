import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../db";
import { TechnicienRepositoryDrizzle } from "../../modules/techniciens/infra/technicien-repository-drizzle";

const URL = process.env.DATABASE_URL;

const TECH_ID = 9_981_001;

describe.skipIf(!URL)("purgerPositionsExpirees — anti-régression CNIL (PG)", () => {
  const admin = new Pool({ connectionString: URL });
  const { db, close } = createDbClient(URL!);
  const repo = new TechnicienRepositoryDrizzle(db);

  const cleanup = () =>
    admin.query('delete from positions_techniciens where "technicienId" = $1', [TECH_ID]);

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await close();
    await admin.end();
  });

  async function insert(expiresAt: Date) {
    await admin.query(
      `insert into positions_techniciens ("technicienId", latitude, longitude, "expiresAt") values ($1, 45.7, 4.8, $2)`,
      [TECH_ID, expiresAt],
    );
  }

  it("supprime les positions expirées et conserve les fraîches", async () => {
    const past = new Date(Date.now() - 1000);
    const future = new Date(Date.now() + 86_400_000);
    await insert(past);
    await insert(future);

    const count = await repo.purgerPositionsExpirees();

    expect(count).toBe(1);

    const { rows } = await admin.query(
      'select "expiresAt" from positions_techniciens where "technicienId" = $1',
      [TECH_ID],
    );
    expect(rows).toHaveLength(1);
    expect(new Date(rows[0].expiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});

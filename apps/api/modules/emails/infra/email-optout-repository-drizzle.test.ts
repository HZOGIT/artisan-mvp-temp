import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { EmailOptoutRepositoryDrizzle } from "./email-optout-repository-drizzle";

const URL = process.env.DATABASE_URL;

describe.skipIf(!URL)("EmailOptoutRepositoryDrizzle (PG, plateforme-level)", () => {
  const admin = new Pool({ connectionString: URL });
  const db = createDbClient(URL!);
  const repo = new EmailOptoutRepositoryDrizzle(db.db);

  const TEST_EMAIL = "optout-test-l2@example.com";
  const TEST_EMAIL2 = "optout-test-l2-b@example.com";

  const cleanup = async () => {
    await admin.query("delete from email_optouts where email in ($1,$2)", [TEST_EMAIL, TEST_EMAIL2]);
  };

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await admin.end();
    await db.pool.end();
  });

  it("isOptedOut → false si absent", async () => {
    expect(await repo.isOptedOut(TEST_EMAIL)).toBe(false);
  });

  it("addOptout → insère, isOptedOut → true", async () => {
    await repo.addOptout(TEST_EMAIL, "test");
    expect(await repo.isOptedOut(TEST_EMAIL)).toBe(true);
  });

  it("addOptout idempotent (pas d'erreur sur doublon)", async () => {
    await expect(repo.addOptout(TEST_EMAIL)).resolves.toBeUndefined();
    expect(await repo.isOptedOut(TEST_EMAIL)).toBe(true);
  });

  it("isOptedOut → false pour une autre adresse", async () => {
    expect(await repo.isOptedOut(TEST_EMAIL2)).toBe(false);
  });
});

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { IcalFeedRepositoryDrizzle } from "./ical-feed-repository-drizzle";
import { getIcalFeed, regenerateIcalFeed } from "../application/use-cases";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9935001;
const B = 9935002;
const UA = 9935003;
const UB = 9935004;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("IcalFeedRepositoryDrizzle (PG : jeton iCal sur artisans, scope par id)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new IcalFeedRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query("delete from artisans where id in ($1,$2)", [A, B]);
    await admin.query("delete from users where id in ($1,$2)", [UA, UB]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UB, `u${UB}@t.fr`]);
    await admin.query('insert into artisans (id, "userId") values ($1,$2)', [A, UA]);
    await admin.query('insert into artisans (id, "userId") values ($1,$2)', [B, UB]);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("getIcalFeed : génère + persiste le jeton à la 1re demande, idempotent ensuite", async () => {
    let n = 0;
    const gen = () => `tokpg${++n}`;
    const first = await getIcalFeed(repo, gen, ctx(A));
    expect(first).toEqual({ path: "/api/calendar/tokpg1.ics" });
    expect(await repo.getToken(ctx(A))).toBe("tokpg1");
    // 2e appel : jeton déjà présent → pas de régénération.
    const second = await getIcalFeed(repo, gen, ctx(A));
    expect(second).toEqual({ path: "/api/calendar/tokpg1.ics" });
    expect(n).toBe(1);
  });

  it("regenerateIcalFeed : remplace le jeton ; le jeton de A ne touche pas B (scope par id)", async () => {
    await regenerateIcalFeed(repo, () => "rot_A", ctx(A));
    expect(await repo.getToken(ctx(A))).toBe("rot_A");
    expect(await repo.getToken(ctx(B))).toBeNull(); // B n'a jamais généré de jeton
  });
});

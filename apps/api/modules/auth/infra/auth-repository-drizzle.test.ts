import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { AuthRepositoryDrizzle } from "./auth-repository-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const U1 = 9943001;
const U2 = 9943002;

describe.skipIf(!URL)("AuthRepositoryDrizzle (PG : users HORS RLS, accès par id/email)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new AuthRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query("delete from users where id in ($1,$2)", [U1, U2]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, name, role, actif) values ($1,$2,$3,$4,'artisan',true)", [U1, "auth1@t.fr", "hash-bcrypt-xyz", "Jean"]);
    await admin.query("insert into users (id, email, password, role, actif) values ($1,$2,$3,'technicien',false)", [U2, "auth2@t.fr", "hash2"]);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("findCredentials : renvoie id/email/password/actif par email ; null si inconnu", async () => {
    const c = await repo.findCredentials("auth1@t.fr");
    expect(c).toMatchObject({ id: U1, email: "auth1@t.fr", password: "hash-bcrypt-xyz", actif: true });
    expect(await repo.findCredentials("nobody@t.fr")).toBeNull();
  });

  it("getById : utilisateur complet (sans hash) ; inactif renvoyé tel quel (actif=false)", async () => {
    const u = await repo.getById(U1);
    expect(u).toMatchObject({ id: U1, email: "auth1@t.fr", name: "Jean", role: "artisan", actif: true });
    expect((u as Record<string, unknown>).password).toBeUndefined();
    expect((await repo.getById(U2))?.actif).toBe(false);
    expect(await repo.getById(99999999)).toBeNull();
  });

  it("touchLastSignedIn : met à jour lastSignedIn", async () => {
    const before = (await admin.query('select "lastSignedIn" from users where id=$1', [U1])).rows[0].lastSignedIn;
    await new Promise((r) => setTimeout(r, 10));
    await repo.touchLastSignedIn(U1);
    const after = (await admin.query('select "lastSignedIn" from users where id=$1', [U1])).rows[0].lastSignedIn;
    expect(new Date(after).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
  });

  it("FIX-CK — bootstrapAccount : crée artisan + abonnement trialing + subscription.created dans billing_events", async () => {
    const testUserId = 9943003;
    try {
      await admin.query("delete from users where id=$1", [testUserId]);
      await admin.query("insert into users (id, email, password, name, role, actif) values ($1,'ck@t.fr','hash','CK','artisan',true)", [testUserId]);
      await repo.bootstrapAccount(testUserId);
      const artisanRow = (await admin.query("select id from artisans where \"userId\"=$1", [testUserId])).rows[0];
      expect(artisanRow, "artisan créé").toBeDefined();
      const subRow = (await admin.query("select id, status, plan_id from billing_subscriptions where artisan_id=$1", [artisanRow.id])).rows[0];
      expect(subRow?.status).toBe("trialing");
      expect(subRow?.plan_id).toBe("starter");
      const evtRow = (await admin.query(
        "select event_type, entity_id, payload from billing_events where entity_type='billing_subscription' AND entity_id=$1 AND event_type='subscription.created'",
        [subRow.id],
      )).rows[0];
      expect(evtRow, "subscription.created dans billing_events").toBeDefined();
      expect(evtRow?.payload?.artisanId).toBe(artisanRow.id);
    } finally {
      await admin.query("delete from users where id=$1", [testUserId]);
    }
  });
});

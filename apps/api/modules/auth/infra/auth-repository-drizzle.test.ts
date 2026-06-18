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
});

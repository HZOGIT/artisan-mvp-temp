import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { ConfigRelancesRepositoryDrizzle } from "../../infra/config-relances-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9944801;
const UB = 9944802;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}
function mut(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}
function q(app: ReturnType<typeof buildApp>, path: string, tok?: string) {
  return injectTrpc(app, "GET", path, undefined, tok);
}

describe.skipIf(!URL)("configRelances.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let server: ReturnType<typeof buildApp>;

  const purge = async (uid: number) => {
    await admin.query('delete from config_relances_auto where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from artisans where "userId"=$1', [uid]);
    await admin.query("delete from users where id=$1", [uid]);
  };

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await purge(uid);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
      await admin.query('insert into artisans ("userId") values ($1)', [uid]);
    }
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), configRelancesRepo: new ConfigRelancesRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB]) await purge(uid);
    await app.close();
    await admin.end();
  });

  it("sans cookie → configRelances.get 401", async () => {
    expect((await q(server, "configRelances.get")).statusCode).toBe(401);
  });

  it("get d'un tenant neuf → défauts", async () => {
    const tA = await token(UA);
    const res = await q(server, "configRelances.get", tA);
    expect(res.statusCode).toBe(200);
    const c = res.json().result.data as { actif: boolean; joursApresEnvoi: number; nombreMaxRelances: number; heureEnvoi: string; joursEnvoi: string; modeleEmailId: number | null };
    expect(c.actif).toBe(false);
    expect(c.joursApresEnvoi).toBe(7);
    expect(c.nombreMaxRelances).toBe(3);
    expect(c.heureEnvoi).toBe("09:00");
    expect(c.joursEnvoi).toBe("1,2,3,4,5");
    expect(c.modeleEmailId).toBeNull();
  });

  it("update + re-get : la config est persistée et relue", async () => {
    const tA = await token(UA);
    const upd = await mut(server, "configRelances.update", { actif: true, nombreMaxRelances: 5, heureEnvoi: "08:30", joursEnvoi: "1,3,5", modeleEmailId: 42 }, tA);
    expect(upd.statusCode).toBe(200);
    const c = (await q(server, "configRelances.get", tA)).json().result.data as { actif: boolean; nombreMaxRelances: number; heureEnvoi: string; joursEnvoi: string; modeleEmailId: number | null };
    expect(c.actif).toBe(true);
    expect(c.nombreMaxRelances).toBe(5);
    expect(c.heureEnvoi).toBe("08:30");
    expect(c.joursEnvoi).toBe("1,3,5");
    expect(c.modeleEmailId).toBe(42);
  });

  it("validations → 400 (nombreMaxRelances 0/11, heureEnvoi 24:00, joursEnvoi 1,8, joursApresEnvoi 0)", async () => {
    const tA = await token(UA);
    expect((await mut(server, "configRelances.update", { nombreMaxRelances: 0 }, tA)).statusCode).toBe(400);
    expect((await mut(server, "configRelances.update", { nombreMaxRelances: 11 }, tA)).statusCode).toBe(400);
    expect((await mut(server, "configRelances.update", { heureEnvoi: "24:00" }, tA)).statusCode).toBe(400);
    expect((await mut(server, "configRelances.update", { joursEnvoi: "1,8" }, tA)).statusCode).toBe(400);
    expect((await mut(server, "configRelances.update", { joursApresEnvoi: 0 }, tA)).statusCode).toBe(400);
  });

  it("update partiel : préserve les autres champs config", async () => {
    const tA = await token(UA);
    await mut(server, "configRelances.update", { actif: true, heureEnvoi: "07:15" }, tA);
    await mut(server, "configRelances.update", { joursApresEnvoi: 14 }, tA);
    const c = (await q(server, "configRelances.get", tA)).json().result.data as { joursApresEnvoi: number; actif: boolean; heureEnvoi: string };
    expect(c.joursApresEnvoi).toBe(14);
    expect(c.actif).toBe(true); // préservé
    expect(c.heureEnvoi).toBe("07:15"); // préservé
  });

  it("isolation cross-tenant : l'update de A n'affecte pas la config de B", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    await mut(server, "configRelances.update", { actif: true }, tA);
    const cB = (await q(server, "configRelances.get", tB)).json().result.data as { actif: boolean };
    expect(cB.actif).toBe(false); // B voit ses défauts
  });
});

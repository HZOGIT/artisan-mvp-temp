import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9962331;
const EMAIL = `u${UID}@t.fr`;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: EMAIL }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

// L3 e2e (HTTP → tRPC `integrationsComptables.*`) : exports/sync vers logiciels comptables (protégé).
describe.skipIf(!URL)("integrationsComptables.router e2e (protégé)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, EMAIL]);
    await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2)', [UID, "IntegrComptables SARL"]);
    app = buildApp({ jwtSecret: SECRET });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("getConfig sans cookie → 401", async () => {
    expect((await injectTrpc(app, "GET", "integrationsComptables.getConfig", undefined)).statusCode).toBe(401);
  });

  it("lectures (cookie) → 200 (config/exports/syncStatus/syncLogs/pendingItems)", async () => {
    const tok = await jwt(UID);
    for (const proc of ["getConfig", "getExports", "getSyncStatus", "getSyncLogs", "getPendingItems"]) {
      expect((await injectTrpc(app, "GET", `integrationsComptables.${proc}`, undefined, tok)).statusCode, proc).toBe(200);
    }
  });

  it("saveConfig valide → 200 ; genererExport logiciel hors enum → 400", async () => {
    const tok = await jwt(UID);
    expect((await injectTrpc(app, "POST", "integrationsComptables.saveConfig", { logiciel: "sage", formatExport: "fec", actif: true }, tok)).statusCode).toBe(200);
    expect((await injectTrpc(app, "POST", "integrationsComptables.genererExport", { logiciel: "excel", formatExport: "fec", dateDebut: "2026-01-01", dateFin: "2026-12-31" }, tok)).statusCode).toBe(400);
  });

  it("getLockDate → null ; verrouillerCompta → 200 ; date reflétée ; format invalide → 400", async () => {
    const tok = await jwt(UID);
    const init = await injectTrpc(app, "GET", "integrationsComptables.getLockDate", undefined, tok);
    expect(init.statusCode).toBe(200);
    /** superjson : null → { json: null } ; string → { json: "..." } */
    expect(JSON.parse(init.body).result.data?.json ?? null).toBeNull();
    expect((await injectTrpc(app, "POST", "integrationsComptables.verrouillerCompta", { date: "2024-12-31" }, tok)).statusCode).toBe(200);
    const after = await injectTrpc(app, "GET", "integrationsComptables.getLockDate", undefined, tok);
    expect(JSON.parse(after.body).result.data?.json ?? JSON.parse(after.body).result.data).toBe("2024-12-31");
    expect((await injectTrpc(app, "POST", "integrationsComptables.verrouillerCompta", { date: "31/12/2024" }, tok)).statusCode).toBe(400);
  });
});

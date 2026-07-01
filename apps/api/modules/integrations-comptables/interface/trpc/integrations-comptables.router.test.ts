import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID = 9962331;
const COLLAB_UID = 9962332; // collaborateur non-owner de UID — gate integrations-comptables.configurer
const EMAIL = `u${UID}@t.fr`;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: `u${userId}@t.fr` }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

// L3 e2e (HTTP → tRPC `integrationsComptables.*`) : exports/sync vers logiciels comptables (protégé).
describe.skipIf(!URL)("integrationsComptables.router e2e (protégé)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query("delete from permissions_utilisateur where \"userId\"=$1", [COLLAB_UID]);
    await admin.query("delete from users where id=$1", [COLLAB_UID]);
    await admin.query('delete from artisans where "userId"=$1', [UID]);
    await admin.query("delete from users where id=$1", [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID, EMAIL]);
    const { rows } = await admin.query<{ id: number }>('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID, "IntegrComptables SARL"]);
    const artisanId = rows[0].id;
    await admin.query('insert into users (id, email, password, role, "artisanId") values ($1,$2,\'x\',\'artisan\',$3)', [COLLAB_UID, `u${COLLAB_UID}@t.fr`, artisanId]);
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

  it("gate permission : collaborateur non-owner sans `integrations-comptables.configurer` → saveConfig 403, verrouillerCompta 403", async () => {
    await admin.query("delete from permissions_utilisateur where \"userId\"=$1", [COLLAB_UID]);
    const tC = await jwt(COLLAB_UID);
    expect((await injectTrpc(app, "POST", "integrationsComptables.saveConfig", { actif: false }, tC)).statusCode).toBe(403);
    expect((await injectTrpc(app, "POST", "integrationsComptables.verrouillerCompta", { date: null }, tC)).statusCode).toBe(403);
  });

  it("gate permission : membre sans `integrations-comptables.configurer` → saveSyncConfig/genererExport/lancerSync/retrySync 403", async () => {
    await admin.query("delete from permissions_utilisateur where \"userId\"=$1", [COLLAB_UID]);
    const tC = await jwt(COLLAB_UID);
    expect((await injectTrpc(app, "POST", "integrationsComptables.saveSyncConfig", { syncAutoFactures: true }, tC)).statusCode, "saveSyncConfig").toBe(403);
    expect((await injectTrpc(app, "POST", "integrationsComptables.genererExport", { logiciel: "sage", formatExport: "fec", dateDebut: "2026-01-01", dateFin: "2026-12-31" }, tC)).statusCode, "genererExport").toBe(403);
    expect((await injectTrpc(app, "POST", "integrationsComptables.lancerSync", {}, tC)).statusCode, "lancerSync").toBe(403);
    expect((await injectTrpc(app, "POST", "integrationsComptables.retrySync", { type: "facture", id: 1 }, tC)).statusCode, "retrySync").toBe(403);
  });

  it("gate permission : membre sans `comptabilite.voir` → getExports/getSyncLogs/getPendingItems/getLockDate 403", async () => {
    await admin.query("delete from permissions_utilisateur where \"userId\"=$1", [COLLAB_UID]);
    const tC = await jwt(COLLAB_UID);
    expect((await injectTrpc(app, "GET", "integrationsComptables.getExports", undefined, tC)).statusCode, "getExports").toBe(403);
    expect((await injectTrpc(app, "GET", "integrationsComptables.getSyncLogs", undefined, tC)).statusCode, "getSyncLogs").toBe(403);
    expect((await injectTrpc(app, "GET", "integrationsComptables.getPendingItems", undefined, tC)).statusCode, "getPendingItems").toBe(403);
    expect((await injectTrpc(app, "GET", "integrationsComptables.getLockDate", undefined, tC)).statusCode, "getLockDate").toBe(403);
  });

  it("gate permission : owner (UID) sans permission DB → saveConfig 200, verrouillerCompta 200 (bypass propriétaire)", async () => {
    await admin.query("delete from permissions_utilisateur where \"userId\"=$1", [UID]);
    const tok = await jwt(UID);
    expect((await injectTrpc(app, "POST", "integrationsComptables.saveConfig", { actif: true }, tok)).statusCode).toBe(200);
    expect((await injectTrpc(app, "POST", "integrationsComptables.verrouillerCompta", { date: null }, tok)).statusCode).toBe(200);
  });
});

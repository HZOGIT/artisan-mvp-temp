import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { PortalAccessRepositoryDrizzle } from "./portal-access-repository-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

// userId uniques (artisans.userId NOT NULL UNIQUE) anti-collision en run parallèle.
const UID_A = 9934051;
const UID_B = 9934052;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 0 });
const day = 24 * 60 * 60 * 1000;

// ⚠️ Valide la policy RLS PUBLIQUE `public_token_select` sur `client_portal_access` (le rôle
// `app_tenant` SANS contexte tenant ne résout QUE l'accès actif + non expiré du token présenté) +
// le scope tenant (`tenant_isolation`) des lectures/écritures par `withTenant`.
describe.skipIf(!URL)("PortalAccessRepositoryDrizzle (RLS public-token + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new PortalAccessRepositoryDrizzle(app.db);
  let artisanA = 0;
  let artisanB = 0;
  let clientA = 0;
  let clientB = 0;

  const cleanup = async () => {
    await admin.query('delete from client_portal_access where "artisanId" in (select id from artisans where "userId" in ($1,$2))', [UID_A, UID_B]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId" in ($1,$2))', [UID_A, UID_B]);
    await admin.query('delete from artisans where "userId" in ($1,$2)', [UID_A, UID_B]);
  };

  const insertAccess = async (clientId: number, artisanId: number, token: string, expiresAt: Date, isActive = true) => {
    await admin.query(
      'insert into client_portal_access ("clientId","artisanId",token,email,"expiresAt","isActive") values ($1,$2,$3,$4,$5,$6)',
      [clientId, artisanId, token, "c@test.com", expiresAt, isActive],
    );
  };

  beforeAll(async () => {
    await cleanup();
    artisanA = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_A, "Portail A"])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_B, "Portail B"])).rows[0].id;
    clientA = (await admin.query('insert into clients ("artisanId",nom,email) values ($1,$2,$3) returning id', [artisanA, "Durand", "a@test.com"])).rows[0].id;
    clientB = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanB, "Martin"])).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("resolveByToken : token actif + non expiré → {clientId, artisanId} (app_tenant sans contexte)", async () => {
    const token = "pa-active-9934051-xxxxxxxxxxxxxxxxxxxxxxxx";
    await insertAccess(clientA, artisanA, token, new Date(Date.now() + 30 * day));
    const r = await repo.resolveByToken(token, new Date());
    expect(r?.clientId).toBe(clientA);
    expect(r?.artisanId).toBe(artisanA);
  });

  it("resolveByToken : token expiré / inactif / inconnu → null", async () => {
    await insertAccess(clientA, artisanA, "pa-expired-9934051-xxxxxxxxxxxxxxxxxxxx", new Date(Date.now() - day));
    await insertAccess(clientA, artisanA, "pa-inactive-9934051-xxxxxxxxxxxxxxxxxxx", new Date(Date.now() + 30 * day), false);
    expect(await repo.resolveByToken("pa-expired-9934051-xxxxxxxxxxxxxxxxxxxx", new Date())).toBeNull();
    expect(await repo.resolveByToken("pa-inactive-9934051-xxxxxxxxxxxxxxxxxxx", new Date())).toBeNull();
    expect(await repo.resolveByToken("pa-unknown-zzzzzzzzzzzzzzzzzzzzzzzzzzz", new Date())).toBeNull();
  });

  it("createAccess : remplace l'ancien lien (désactive les accès existants du client, parité legacy)", async () => {
    const old = "pa-old-9934051-xxxxxxxxxxxxxxxxxxxxxxxxxx";
    await insertAccess(clientA, artisanA, old, new Date(Date.now() + 30 * day));
    const neuf = "pa-new-9934051-xxxxxxxxxxxxxxxxxxxxxxxxxx";
    await repo.createAccess(ctx(artisanA), { clientId: clientA, token: neuf, email: "a@test.com", expiresAt: new Date(Date.now() + 30 * day) });
    expect(await repo.resolveByToken(old, new Date())).toBeNull(); // ancien désactivé
    expect((await repo.resolveByToken(neuf, new Date()))?.clientId).toBe(clientA); // nouveau actif
  });

  it("getStatusByClientId : actif renvoyé ; cross-tenant → null (anti-IDOR)", async () => {
    const token = "pa-status-9934051-xxxxxxxxxxxxxxxxxxxxxxx";
    await repo.createAccess(ctx(artisanA), { clientId: clientA, token, email: "a@test.com", expiresAt: new Date(Date.now() + 30 * day) });
    const st = await repo.getStatusByClientId(ctx(artisanA), clientA);
    expect(st?.actif).toBe(true);
    expect(st?.token).toBe(token);
    // B ne voit pas l'accès du client de A
    expect(await repo.getStatusByClientId(ctx(artisanB), clientA)).toBeNull();
  });

  it("deactivateByClientId : coupe l'accès (status → null, token plus résolu)", async () => {
    const token = "pa-deact-9934051-xxxxxxxxxxxxxxxxxxxxxxxx";
    await repo.createAccess(ctx(artisanA), { clientId: clientA, token, email: "a@test.com", expiresAt: new Date(Date.now() + 30 * day) });
    await repo.deactivateByClientId(ctx(artisanA), clientA);
    expect(await repo.getStatusByClientId(ctx(artisanA), clientA)).toBeNull();
    expect(await repo.resolveByToken(token, new Date())).toBeNull();
  });

  it("getClientInfo : scopé tenant (A voit son client ; B → null cross-tenant)", async () => {
    expect((await repo.getClientInfo(ctx(artisanA), clientA))?.nom).toBe("Durand");
    expect(await repo.getClientInfo(ctx(artisanB), clientA)).toBeNull();
  });

  it("getArtisanPublic : lecture par id (hors RLS) ; id inconnu → null", async () => {
    expect((await repo.getArtisanPublic(artisanA))?.nomEntreprise).toBe("Portail A");
    expect(await repo.getArtisanPublic(987654321)).toBeNull();
  });
});

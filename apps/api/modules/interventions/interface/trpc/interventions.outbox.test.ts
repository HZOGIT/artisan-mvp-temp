import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { InterventionRepositoryDrizzle } from "../../infra/intervention-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { withOutbox } from "../../../../shared/events/with-outbox";
import { outboxEvent } from "../../../../shared/events/outbox-event";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9939901;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

function callMutation(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}

describe.skipIf(!URL)("interventions.outbox atomicité (L2 — Drizzle + PG local)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let clientId = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    await admin.query('delete from event_outbox where "artisanId" in (select id from artisans where "userId"=$1)', [UA]);
    await admin.query('delete from interventions where "artisanId" in (select id from artisans where "userId"=$1)', [UA]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [UA]);
    await admin.query('delete from artisans where "userId"=$1', [UA]);
    await admin.query("delete from users where id=$1", [UA]);
    await admin.query('delete from permissions_utilisateur where "userId"=$1', [UA]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    for (const p of ["interventions.voir", "interventions.gerer"]) {
      await admin.query('insert into permissions_utilisateur ("userId", permission, autorise) values ($1,$2,true)', [UA, p]);
    }
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    clientId = (await admin.query('insert into clients ("artisanId", nom) values ($1, $2) returning id', [artisanA, "Client Outbox Test"])).rows[0].id;
    const repo = new InterventionRepositoryDrizzle(app.db);
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), interventionRepo: repo, interventionsDb: app.db });
  });

  afterAll(async () => {
    await server.close();
    await admin.query('delete from event_outbox where "artisanId"=$1', [artisanA]);
    await admin.query('delete from interventions where "artisanId"=$1', [artisanA]);
    await admin.query('delete from clients where "artisanId"=$1', [artisanA]);
    await admin.query('delete from artisans where "userId"=$1', [UA]);
    await admin.query("delete from users where id=$1", [UA]);
    await admin.query('delete from permissions_utilisateur where "userId"=$1', [UA]);
    await app.close();
    await admin.end();
  });

  it("outbox atomicité — create → intervention ET event_outbox co-écrits (artisanId + userId + action + payload)", async () => {
    const tA = await token(UA);
    const before = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    const res = await callMutation(server, "interventions.create", {
      clientId,
      titre: "Pose chaudière outbox",
      dateDebut: "2099-10-01T08:00:00Z",
    }, tA);
    expect(res.statusCode).toBe(200);
    const interventionId = (res.json() as { result: { data: { id: number } } }).result.data.id as number;
    const row = (await admin.query("select * from event_outbox where \"entityId\"=$1 and action='intervention.creee'", [interventionId])).rows[0];
    expect(row).toBeDefined();
    expect(row.artisanId).toBe(artisanA);
    expect(row.userId).toBe(UA);
    expect(row.entityType).toBe("intervention");
    expect((row.payload as { clientId?: number }).clientId).toBe(clientId);
    const after = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(after).toBe(before + 1);
  });

  it("update statut=en_cours → event_outbox action='intervention.demarree' co-écrit", async () => {
    const tA = await token(UA);
    const created = await callMutation(server, "interventions.create", { clientId, titre: "Demarree test", dateDebut: "2099-10-02T08:00:00Z" }, tA);
    expect(created.statusCode).toBe(200);
    const interventionId = (created.json() as { result: { data: { id: number } } }).result.data.id;
    const res = await callMutation(server, "interventions.update", { id: interventionId, statut: "en_cours" }, tA);
    expect(res.statusCode).toBe(200);
    const row = (await admin.query("select action from event_outbox where \"entityId\"=$1 and action='intervention.demarree'", [interventionId])).rows[0];
    expect(row).toBeDefined();
  });

  it("update statut=terminee → event_outbox action='intervention.terminee' co-écrit", async () => {
    const tA = await token(UA);
    const created = await callMutation(server, "interventions.create", { clientId, titre: "Terminee test", dateDebut: "2099-10-03T08:00:00Z" }, tA);
    expect(created.statusCode).toBe(200);
    const interventionId = (created.json() as { result: { data: { id: number } } }).result.data.id;
    await callMutation(server, "interventions.update", { id: interventionId, statut: "en_cours" }, tA);
    const res = await callMutation(server, "interventions.update", { id: interventionId, statut: "terminee" }, tA);
    expect(res.statusCode).toBe(200);
    const row = (await admin.query("select action from event_outbox where \"entityId\"=$1 and action='intervention.terminee'", [interventionId])).rows[0];
    expect(row).toBeDefined();
  });

  it("update statut=annulee → event_outbox action='intervention.annulee' co-écrit", async () => {
    const tA = await token(UA);
    const created = await callMutation(server, "interventions.create", { clientId, titre: "Annulee test", dateDebut: "2099-10-04T08:00:00Z" }, tA);
    expect(created.statusCode).toBe(200);
    const interventionId = (created.json() as { result: { data: { id: number } } }).result.data.id;
    const res = await callMutation(server, "interventions.update", { id: interventionId, statut: "annulee" }, tA);
    expect(res.statusCode).toBe(200);
    const row = (await admin.query("select action from event_outbox where \"entityId\"=$1 and action='intervention.annulee'", [interventionId])).rows[0];
    expect(row).toBeDefined();
  });

  it("outbox atomicité — rollback: throw après write intervention → 0 intervention ET 0 event_outbox persistés", async () => {
    const ctx = { artisanId: artisanA, userId: UA, role: "artisan" as const, isOwner: true, franchiseTVA: false };
    const repo = new InterventionRepositoryDrizzle(app.db);
    const interventionsBefore = Number((await admin.query('select count(*) from interventions where "artisanId"=$1', [artisanA])).rows[0].count);
    const outboxBefore = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);

    await expect(
      withOutbox(app.db, repo, async (r, tx) => {
        await r.create(ctx, { clientId, titre: "Rollback test", dateDebut: new Date("2099-11-01T08:00:00Z") });
        if (tx) await outboxEvent(tx, ctx, { action: "intervention.creee", entityType: "intervention", entityId: 99999, payload: {} });
        throw new Error("échec simulé post-write");
      }),
    ).rejects.toThrow("échec simulé post-write");

    const interventionsAfter = Number((await admin.query('select count(*) from interventions where "artisanId"=$1', [artisanA])).rows[0].count);
    const outboxAfter = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(interventionsAfter).toBe(interventionsBefore);
    expect(outboxAfter).toBe(outboxBefore);
  });
});

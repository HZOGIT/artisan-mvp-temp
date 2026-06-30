import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { ContratRepositoryDrizzle } from "../../infra/contrat-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { withOutbox } from "../../../../shared/events/with-outbox";
import { outboxEvent } from "../../../../shared/events/outbox-event";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9946001;
const DATE = "2026-07-01T00:00:00.000Z";

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

function callMutation(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}

describe.skipIf(!URL)("contrats.outbox atomicité (L2 — Drizzle + PG local)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let clientA = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    await admin.query('delete from event_outbox where "artisanId" in (select id from artisans where "userId"=$1)', [UA]);
    await admin.query('delete from contrats_maintenance where "artisanId" in (select id from artisans where "userId"=$1)', [UA]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [UA]);
    await admin.query('delete from permissions_utilisateur where "userId"=$1', [UA]);
    await admin.query('delete from artisans where "userId"=$1', [UA]);
    await admin.query("delete from users where id=$1", [UA]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    for (const p of ["contrats.voir", "contrats.gerer"]) {
      await admin.query('insert into permissions_utilisateur ("userId", permission, autorise) values ($1,$2,true)', [UA, p]);
    }
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    clientA = (await admin.query('insert into clients ("artisanId", nom) values ($1,$2) returning id', [artisanA, "Pilote Outbox"])).rows[0].id;
    const repo = new ContratRepositoryDrizzle(app.db);
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), contratRepo: repo, contratsMaintenanceDb: app.db });
  });

  afterAll(async () => {
    await server.close();
    await admin.query('delete from event_outbox where "artisanId"=$1', [artisanA]);
    await admin.query('delete from contrats_maintenance where "artisanId"=$1', [artisanA]);
    await admin.query('delete from clients where "artisanId"=$1', [artisanA]);
    await admin.query('delete from permissions_utilisateur where "userId"=$1', [UA]);
    await admin.query('delete from artisans where "userId"=$1', [UA]);
    await admin.query("delete from users where id=$1", [UA]);
    await app.close();
    await admin.end();
  });

  it("outbox atomicité — create → contrat ET event_outbox co-écrits (artisanId + userId + action + payload)", async () => {
    const tA = await token(UA);
    const before = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    const res = await callMutation(server, "contrats.create", { clientId: clientA, titre: "Entretien Pilote", montantHT: "500.00", periodicite: "annuel", dateDebut: DATE }, tA);
    expect(res.statusCode).toBe(200);
    const contratId = res.json().result.data.id as number;
    const row = (await admin.query("select * from event_outbox where \"entityId\"=$1 and action='contrat.cree'", [contratId])).rows[0];
    expect(row).toBeDefined();
    expect(row.artisanId).toBe(artisanA);
    expect(row.userId).toBe(UA);
    expect(row.entityType).toBe("contrat");
    expect((row.payload as { clientId?: number }).clientId).toBe(clientA);
    const after = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(after).toBe(before + 1);
  });

  it("reviserPrix — ligne historique + event outbox co-écrits dans la même transaction", async () => {
    const tA = await token(UA);
    const contratRes = await callMutation(server, "contrats.create", { clientId: clientA, titre: "Contrat Rev", montantHT: "300.00", periodicite: "annuel", dateDebut: DATE, tauxIndexationAnnuel: "2" }, tA);
    expect(contratRes.statusCode).toBe(200);
    const contratId = contratRes.json().result.data.id as number;
    const outboxBefore = Number((await admin.query("select count(*) from event_outbox where action='contrat.prix_revise'")).rows[0].count);
    const histBefore = Number((await admin.query('select count(*) from historique_revisions_prix where "contratId"=$1', [contratId])).rows[0].count);
    const res = await callMutation(server, "contrats.reviserPrix", { id: contratId }, tA);
    expect(res.statusCode).toBe(200);
    const outboxRow = (await admin.query("select * from event_outbox where action='contrat.prix_revise' and \"entityId\"=$1", [contratId])).rows[0];
    expect(outboxRow).toBeDefined();
    expect(outboxRow.artisanId).toBe(artisanA);
    expect((outboxRow.payload as { ancienMontantHT?: string }).ancienMontantHT).toBe("300.00");
    const histAfter = Number((await admin.query('select count(*) from historique_revisions_prix where "contratId"=$1', [contratId])).rows[0].count);
    expect(histAfter).toBe(histBefore + 1);
    expect(Number((await admin.query("select count(*) from event_outbox where action='contrat.prix_revise'")).rows[0].count)).toBe(outboxBefore + 1);
  });

  it("outbox atomicité — rollback: throw après write contrat → 0 contrat ET 0 event_outbox persistés", async () => {
    const ctx = { artisanId: artisanA, userId: UA, role: "artisan" as const, isOwner: true, franchiseTVA: false };
    const repo = new ContratRepositoryDrizzle(app.db);
    const contratsBefore = Number((await admin.query('select count(*) from contrats_maintenance where "artisanId"=$1', [artisanA])).rows[0].count);
    const outboxBefore = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);

    await expect(
      withOutbox(app.db, repo, async (r, tx) => {
        const ref = await r.nextReference(ctx);
        await r.create(ctx, { clientId: clientA, titre: "Rollback Test", montantHT: "100.00", periodicite: "annuel", dateDebut: new Date(DATE) }, ref);
        if (tx) await outboxEvent(tx, ctx, { action: "contrat.cree", entityType: "contrat", entityId: 99999, payload: {} });
        throw new Error("échec simulé post-write");
      }),
    ).rejects.toThrow("échec simulé post-write");

    const contratsAfter = Number((await admin.query('select count(*) from contrats_maintenance where "artisanId"=$1', [artisanA])).rows[0].count);
    const outboxAfter = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(contratsAfter).toBe(contratsBefore);
    expect(outboxAfter).toBe(outboxBefore);
  });
});

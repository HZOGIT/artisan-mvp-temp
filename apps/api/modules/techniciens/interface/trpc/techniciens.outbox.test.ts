import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { TechnicienRepositoryDrizzle } from "../../infra/technicien-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { withOutbox } from "../../../../shared/events/with-outbox";
import { outboxEvent } from "../../../../shared/events/outbox-event";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9938001;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

function callMutation(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}

describe.skipIf(!URL)("techniciens.outbox atomicité (L2 — Drizzle + PG local)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    await admin.query('delete from event_outbox where "artisanId" in (select id from artisans where "userId"=$1)', [UA]);
    await admin.query('delete from habilitations_techniciens where "artisanId" in (select id from artisans where "userId"=$1)', [UA]);
    await admin.query('delete from disponibilites_techniciens where "technicienId" in (select id from techniciens where "artisanId" in (select id from artisans where "userId"=$1))', [UA]);
    await admin.query('delete from positions_techniciens where "technicienId" in (select id from techniciens where "artisanId" in (select id from artisans where "userId"=$1))', [UA]);
    await admin.query('delete from techniciens where "artisanId" in (select id from artisans where "userId"=$1)', [UA]);
    await admin.query('delete from artisans where "userId"=$1', [UA]);
    await admin.query("delete from users where id=$1", [UA]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    const repo = new TechnicienRepositoryDrizzle(app.db);
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), technicienRepo: repo, techniciensDb: app.db });
  });

  afterAll(async () => {
    await server.close();
    await admin.query('delete from event_outbox where "artisanId"=$1', [artisanA]);
    await admin.query('delete from habilitations_techniciens where "artisanId"=$1', [artisanA]);
    await admin.query('delete from disponibilites_techniciens where "technicienId" in (select id from techniciens where "artisanId"=$1)', [artisanA]);
    await admin.query('delete from positions_techniciens where "technicienId" in (select id from techniciens where "artisanId"=$1)', [artisanA]);
    await admin.query('delete from techniciens where "artisanId"=$1', [artisanA]);
    await admin.query('delete from artisans where "userId"=$1', [UA]);
    await admin.query("delete from users where id=$1", [UA]);
    await app.close();
    await admin.end();
  });

  it("outbox atomicité — create → technicien ET event_outbox co-écrits (artisanId + userId + action + payload)", async () => {
    const tA = await token(UA);
    const before = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    const res = await callMutation(server, "techniciens.create", { nom: "Pilote", specialite: "Élec" }, tA);
    expect(res.statusCode).toBe(200);
    const techId = res.json().result.data.id as number;
    const row = (await admin.query("select * from event_outbox where \"entityId\"=$1 and action='technicien.cree'", [techId])).rows[0];
    expect(row).toBeDefined();
    expect(row.artisanId).toBe(artisanA);
    expect(row.userId).toBe(UA);
    expect(row.entityType).toBe("technicien");
    expect((row.payload as { specialite?: string }).specialite).toBe("Élec");
    const after = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(after).toBe(before + 1);
  });

  it("outbox atomicité — rollback: throw après write technicien → 0 technicien ET 0 event_outbox persistés", async () => {
    const ctx = { artisanId: artisanA, userId: UA, role: "artisan" as const, isOwner: true, franchiseTVA: false };
    const repo = new TechnicienRepositoryDrizzle(app.db);
    const techsBefore = Number((await admin.query('select count(*) from techniciens where "artisanId"=$1', [artisanA])).rows[0].count);
    const outboxBefore = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);

    await expect(
      withOutbox(app.db, repo, async (r, tx) => {
        await r.create(ctx, { nom: "Rollback", specialite: null, prenom: null, email: null, telephone: null, couleur: null, statut: "actif", coutHoraire: null, userId: null, notes: null, typeContrat: null });
        if (tx) await outboxEvent(tx, ctx, { action: "technicien.cree", entityType: "technicien", entityId: 99999, payload: {} });
        throw new Error("échec simulé post-write");
      }),
    ).rejects.toThrow("échec simulé post-write");

    const techsAfter = Number((await admin.query('select count(*) from techniciens where "artisanId"=$1', [artisanA])).rows[0].count);
    const outboxAfter = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(techsAfter).toBe(techsBefore);
    expect(outboxAfter).toBe(outboxBefore);
  });
});

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { ModeleDevisRepositoryDrizzle } from "../../infra/modele-devis-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { withOutbox } from "../../../../shared/events/with-outbox";
import { outboxEvent } from "../../../../shared/events/outbox-event";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9921001;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

function mut(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}

describe.skipIf(!URL)("modeles-devis.outbox atomicité (L2 — Drizzle + PG local)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let modeleId = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    await admin.query('delete from event_outbox where "artisanId" in (select id from artisans where "userId"=$1)', [UA]);
    await admin.query('delete from modeles_devis_lignes where "modeleId" in (select id from modeles_devis where "artisanId" in (select id from artisans where "userId"=$1))', [UA]);
    await admin.query('delete from modeles_devis where "artisanId" in (select id from artisans where "userId"=$1)', [UA]);
    await admin.query('delete from artisans where "userId"=$1', [UA]);
    await admin.query("delete from users where id=$1", [UA]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    const repo = new ModeleDevisRepositoryDrizzle(app.db);
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), modeleDevisRepo: repo, modelesDevisDb: app.db });
  });

  afterAll(async () => {
    await server.close();
    await admin.query('delete from event_outbox where "artisanId"=$1', [artisanA]);
    await admin.query('delete from modeles_devis_lignes where "modeleId" in (select id from modeles_devis where "artisanId"=$1)', [artisanA]);
    await admin.query('delete from modeles_devis where "artisanId"=$1', [artisanA]);
    await admin.query('delete from artisans where "userId"=$1', [UA]);
    await admin.query("delete from users where id=$1", [UA]);
    await app.close();
    await admin.end();
  });

  it("outbox atomicité — create → modele_devis ET event_outbox co-écrits (action modele_devis.cree + payload)", async () => {
    const tA = await token(UA);
    const before = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    const res = await mut(server, "modelesDevis.create", { nom: "Modèle Pilote Outbox" }, tA);
    expect(res.statusCode).toBe(200);
    modeleId = res.json().result.data.id as number;
    const row = (await admin.query("select * from event_outbox where \"entityId\"=$1 and action='modele_devis.cree'", [modeleId])).rows[0];
    expect(row).toBeDefined();
    expect(row.artisanId).toBe(artisanA);
    expect(row.userId).toBe(UA);
    expect(row.entityType).toBe("modele_devis");
    expect((row.payload as { nom?: string }).nom).toBe("Modèle Pilote Outbox");
    const after = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(after).toBe(before + 1);
  });

  it("outbox atomicité — rollback: throw après create → 0 modele ET 0 event_outbox persistés", async () => {
    const ctx = { artisanId: artisanA, userId: UA, role: "artisan" as const, isOwner: true, franchiseTVA: false };
    const repo = new ModeleDevisRepositoryDrizzle(app.db);
    const modelesBefore = Number((await admin.query('select count(*) from modeles_devis where "artisanId"=$1', [artisanA])).rows[0].count);
    const outboxBefore = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);

    await expect(
      withOutbox(app.db, repo, async (r, tx) => {
        await r.create(ctx, { nom: "Modèle à rollbacker", lignes: [] });
        if (tx) await outboxEvent(tx, ctx, { action: "modele_devis.cree", entityType: "modele_devis", entityId: 99999, payload: {} });
        throw new Error("échec simulé post-write");
      }),
    ).rejects.toThrow("échec simulé post-write");

    const modelesAfter = Number((await admin.query('select count(*) from modeles_devis where "artisanId"=$1', [artisanA])).rows[0].count);
    const outboxAfter = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(modelesAfter).toBe(modelesBefore);
    expect(outboxAfter).toBe(outboxBefore);
  });
});

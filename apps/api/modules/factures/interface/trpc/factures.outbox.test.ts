import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { FactureRepositoryDrizzle } from "../../infra/facture-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { withOutbox } from "../../../../shared/events/with-outbox";
import { outboxEvent } from "../../../../shared/events/outbox-event";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9939002;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

function callMutation(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}

describe.skipIf(!URL)("factures.outbox atomicité (L2 — Drizzle + PG local)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let clientA = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    await admin.query('delete from event_outbox where "artisanId" in (select id from artisans where "userId"=$1)', [UA]);
    await admin.query('delete from factures_lignes where "factureId" in (select id from factures where "artisanId" in (select id from artisans where "userId"=$1))', [UA]);
    await admin.query('delete from factures where "artisanId" in (select id from artisans where "userId"=$1)', [UA]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [UA]);
    await admin.query('delete from artisans where "userId"=$1', [UA]);
    await admin.query("delete from users where id=$1", [UA]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    clientA = (await admin.query('insert into clients ("artisanId", nom) values ($1,$2) returning id', [artisanA, "Client Outbox"])).rows[0].id;
    const repo = new FactureRepositoryDrizzle(app.db);
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), factureRepo: repo, facturesDb: app.db });
  });

  afterAll(async () => {
    await server.close();
    await admin.query('delete from event_outbox where "artisanId"=$1', [artisanA]);
    await admin.query('delete from factures_lignes where "factureId" in (select id from factures where "artisanId"=$1)', [artisanA]);
    await admin.query('delete from factures where "artisanId"=$1', [artisanA]);
    await admin.query('delete from clients where "artisanId"=$1', [artisanA]);
    await admin.query('delete from artisans where "userId"=$1', [UA]);
    await admin.query("delete from users where id=$1", [UA]);
    await app.close();
    await admin.end();
  });

  const ligne = { designation: "Prestation", prixUnitaireHT: "100.00", quantite: "1.00" };

  it("outbox atomicité — create → facture ET event_outbox co-écrits (artisanId + userId + action + payload)", async () => {
    const tA = await token(UA);
    const before = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    const res = await callMutation(server, "factures.create", { clientId: clientA, lignes: [ligne] }, tA);
    expect(res.statusCode).toBe(200);
    const factureId = res.json().result.data.id as number;
    const row = (await admin.query("select * from event_outbox where \"entityId\"=$1 and action='facture.creee'", [factureId])).rows[0];
    expect(row).toBeDefined();
    expect(row.artisanId).toBe(artisanA);
    expect(row.userId).toBe(UA);
    expect(row.entityType).toBe("facture");
    expect((row.payload as { clientId?: number }).clientId).toBe(clientA);
    const after = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(after).toBe(before + 1);
  });

  it("outbox atomicité — rollback: throw après write facture → 0 facture ET 0 event_outbox persistés", async () => {
    const ctx = { artisanId: artisanA, userId: UA, role: "artisan" as const, isOwner: true, franchiseTVA: false };
    const repo = new FactureRepositoryDrizzle(app.db);
    const facturesBefore = Number((await admin.query('select count(*) from factures where "artisanId"=$1', [artisanA])).rows[0].count);
    const outboxBefore = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);

    await expect(
      withOutbox(app.db, repo, async (r, tx) => {
        await r.create(ctx, { clientId: clientA, devisId: null, typeDocument: "facture", factureOrigineId: null, objet: null, referenceClient: null, siretDestinataire: null, conditionsPaiement: null, notes: null, dateEcheance: null });
        if (tx) await outboxEvent(tx, ctx, { action: "facture.creee", entityType: "facture", entityId: 99999, payload: {} });
        throw new Error("échec simulé post-write");
      }),
    ).rejects.toThrow("échec simulé post-write");

    const facturesAfter = Number((await admin.query('select count(*) from factures where "artisanId"=$1', [artisanA])).rows[0].count);
    const outboxAfter = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(facturesAfter).toBe(facturesBefore);
    expect(outboxAfter).toBe(outboxBefore);
  });
});

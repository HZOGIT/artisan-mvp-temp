import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { NoteDeFraisRepositoryDrizzle } from "../../infra/note-de-frais-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";
import { withOutbox } from "../../../../shared/events/with-outbox";
import { outboxEvent } from "../../../../shared/events/outbox-event";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9949001;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

function callMutation(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}

describe.skipIf(!URL)("notesDeFrais.outbox atomicité (L2 — Drizzle + PG local)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    await admin.query("delete from notes_de_frais where artisan_id in (select id from artisans where \"userId\"=$1)", [UA]);
    await admin.query("delete from event_outbox where \"artisanId\" in (select id from artisans where \"userId\"=$1)", [UA]);
    await admin.query("delete from artisans where \"userId\"=$1", [UA]);
    await admin.query("delete from users where id=$1", [UA]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    artisanA = (await admin.query("insert into artisans (\"userId\") values ($1) returning id", [UA])).rows[0].id;
    const repo = new NoteDeFraisRepositoryDrizzle(app.db);
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), noteDeFraisRepo: repo, notesDeFraisDb: app.db });
  });

  afterAll(async () => {
    await server.close();
    await admin.query("delete from notes_de_frais where artisan_id=$1", [artisanA]);
    await admin.query("delete from event_outbox where \"artisanId\"=$1", [artisanA]);
    await admin.query("delete from artisans where \"userId\"=$1", [UA]);
    await admin.query("delete from users where id=$1", [UA]);
    await app.close();
    await admin.end();
  });

  it("outbox atomicité — create → note ET event_outbox co-écrits (artisanId + userId + action + payload)", async () => {
    const tA = await token(UA);
    const before = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    const res = await callMutation(server, "notesDeFrais.create", { numero: "NDF-OB-001", titre: "Frais outbox", periodeDebut: "2026-06-01", periodeFin: "2026-06-30" }, tA);
    expect(res.statusCode).toBe(200);
    const noteId = res.json().result.data.id as number;
    const row = (await admin.query("select * from event_outbox where \"entityId\"=$1 and action='note_de_frais.creee'", [noteId])).rows[0];
    expect(row).toBeDefined();
    expect(row.artisanId).toBe(artisanA);
    expect(row.userId).toBe(UA);
    expect(row.entityType).toBe("note_de_frais");
    expect((row.payload as { titre?: string }).titre).toBe("Frais outbox");
    const after = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(after).toBe(before + 1);
  });

  it("outbox atomicité — rollback: throw après write note → 0 note ET 0 event_outbox persistés", async () => {
    const ctx = { artisanId: artisanA, userId: UA, role: "artisan" as const, isOwner: true, franchiseTVA: false };
    const repo = new NoteDeFraisRepositoryDrizzle(app.db);
    const notesBefore = Number((await admin.query("select count(*) from notes_de_frais where artisan_id=$1", [artisanA])).rows[0].count);
    const outboxBefore = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);

    await expect(
      withOutbox(app.db, repo, async (r, tx) => {
        await r.create(ctx, { userId: UA, numero: "NDF-OB-FAIL", titre: "Rollback", periodeDebut: "2026-07-01", periodeFin: "2026-07-31" });
        if (tx) await outboxEvent(tx, ctx, { action: "note_de_frais.creee", entityType: "note_de_frais", entityId: 99999, payload: {} });
        throw new Error("échec simulé post-write");
      }),
    ).rejects.toThrow("échec simulé post-write");

    const notesAfter = Number((await admin.query("select count(*) from notes_de_frais where artisan_id=$1", [artisanA])).rows[0].count);
    const outboxAfter = Number((await admin.query("select count(*) from event_outbox")).rows[0].count);
    expect(notesAfter).toBe(notesBefore);
    expect(outboxAfter).toBe(outboxBefore);
  });
});

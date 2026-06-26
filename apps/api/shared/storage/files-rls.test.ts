import { describe, it, expect, afterAll } from "vitest";
import { sql, eq } from "drizzle-orm";
import { Pool } from "pg";
import { createDbClient } from "../db/client";
import { withTenant } from "../db/with-tenant";
import { outboxEvent } from "../events/outbox-event";
import { files } from "../../../../drizzle/schema/files";
import type { TenantContext } from "../tenant";

const URL = process.env.DATABASE_URL;
const APP_URL = process.env.APP_DATABASE_URL ?? (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("files — RLS tenant + atomicité outbox", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);

  let artisanA = 0;
  let artisanB = 0;

  afterAll(async () => {
    await admin.query("delete from files where storage_key like 'test-rls/%'").catch(() => {});
    await admin.query("delete from event_outbox where \"entityType\" = 'fichier' and payload->>'key' like 'test-rls/%'").catch(() => {});
    if (artisanA) await admin.query("delete from artisans where id = $1", [artisanA]).catch(() => {});
    if (artisanB) await admin.query("delete from artisans where id = $1", [artisanB]).catch(() => {});
    await app.close().catch(() => {});
    await admin.end();
  });

  it("setup : crée deux artisans de test", async () => {
    const uA = (await admin.query("insert into users default values returning id")).rows[0].id as number;
    const uB = (await admin.query("insert into users default values returning id")).rows[0].id as number;
    artisanA = (await admin.query(`insert into artisans ("userId") values ($1) returning id`, [uA])).rows[0].id as number;
    artisanB = (await admin.query(`insert into artisans ("userId") values ($1) returning id`, [uB])).rows[0].id as number;
    expect(artisanA).toBeGreaterThan(0);
    expect(artisanB).toBeGreaterThan(0);
  });

  it("withTenant isole les fichiers par tenant", async () => {
    const key = `test-rls/${Date.now()}-a.pdf`;
    await admin.query(
      `insert into files (artisan_id, storage_key, mime_type, size_bytes, sha256, purpose, bucket)
       values ($1, $2, 'application/pdf', 100, repeat('a',64), 'devis_pdf', 'test')`,
      [artisanA, key],
    );

    const countFor = async (artisanId: number) =>
      withTenant(app.db, ctx(artisanId), async (tx) => {
        const r = await tx.execute(sql`select count(*)::int as n from files where storage_key = ${key}`);
        return (r.rows[0] as { n: number }).n;
      });

    expect(await countFor(artisanA)).toBe(1);
    expect(await countFor(artisanB)).toBe(0);

    const noTenant = await app.db.execute(sql`select count(*)::int as n from files where storage_key = ${key}`);
    expect((noTenant.rows[0] as { n: number }).n).toBe(0);
  });

  it("atomicité : throw dans la tx rollback files ET outbox", async () => {
    const key = `test-rls/${Date.now()}-atomic.pdf`;
    const filesBefore = (await admin.query("select count(*)::int as n from files where storage_key = $1", [key])).rows[0].n as number;
    const outboxBefore = (await admin.query("select count(*)::int as n from event_outbox where \"action\" = 'fichier.importe'")).rows[0].n as number;

    await expect(
      withTenant(app.db, ctx(artisanA), async (tx) => {
        await tx.insert(files).values({
          artisanId: artisanA,
          storageKey: key,
          mimeType: "application/pdf",
          sizeBytes: 42,
          sha256: "a".repeat(64),
          purpose: "devis_pdf",
          bucket: "test",
        });
        await outboxEvent(tx, ctx(artisanA), { action: "fichier.importe", entityType: "fichier", entityId: 0, payload: { key } });
        throw new Error("rollback forcé");
      }),
    ).rejects.toThrow("rollback forcé");

    const filesAfter = (await admin.query("select count(*)::int as n from files where storage_key = $1", [key])).rows[0].n as number;
    const outboxAfter = (await admin.query("select count(*)::int as n from event_outbox where \"action\" = 'fichier.importe'")).rows[0].n as number;

    expect(filesAfter).toBe(filesBefore);
    expect(outboxAfter).toBe(outboxBefore);
  });

  it("insertion réussie : file ET outbox commités ensemble", async () => {
    const key = `test-rls/${Date.now()}-commit.pdf`;

    const file = await withTenant(app.db, ctx(artisanA), async (tx) => {
      const [row] = await tx.insert(files).values({
        artisanId: artisanA,
        storageKey: key,
        mimeType: "image/png",
        sizeBytes: 200,
        sha256: "b".repeat(64),
        purpose: "logo",
        bucket: "test",
      }).returning();
      await outboxEvent(tx, ctx(artisanA), { action: "fichier.importe", entityType: "fichier", entityId: row.id, payload: { key, purpose: "logo", size: 200, mimetype: "image/png", sha256: "b".repeat(64) } });
      return row;
    });

    const fileRow = (await admin.query("select id from files where storage_key = $1", [key])).rows[0];
    expect(fileRow).toBeDefined();
    expect(file.id).toBe(fileRow.id);

    const outboxRow = (await admin.query("select * from event_outbox where \"action\" = 'fichier.importe' and \"entityId\" = $1", [file.id])).rows[0];
    expect(outboxRow).toBeDefined();
    expect(outboxRow.artisanId).toBe(artisanA);
  });
});

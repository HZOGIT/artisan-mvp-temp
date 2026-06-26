import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient, withTenant } from "../../../shared/db";
import { files } from "../../../../../drizzle/schema/files";
import { messageFiles } from "../../../../../drizzle/schema/message-files";
import { inArray } from "drizzle-orm";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID_A = 9954401;
const UID_B = 9954402;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 0 });

/** L2 RLS — isolation files + message_files : artisan B ne peut pas lire les fichiers de A ni y insérer. */
describe.skipIf(!URL)("assistant upload — RLS isolation files + message_files", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let artisanB = 0;
  let fileIdA = 0;

  const cleanup = async () => {
    await admin.query("delete from message_files where artisan_id in (select id from artisans where \"userId\" = any($1))", [[UID_A, UID_B]]);
    await admin.query("delete from files where artisan_id in (select id from artisans where \"userId\" = any($1))", [[UID_A, UID_B]]);
    await admin.query("delete from artisans where \"userId\" = any($1)", [[UID_A, UID_B]]);
  };

  beforeAll(async () => {
    await cleanup();
    artisanA = (await admin.query("insert into artisans (\"userId\",\"nomEntreprise\") values ($1,$2) returning id", [UID_A, "Upload A"])).rows[0].id;
    artisanB = (await admin.query("insert into artisans (\"userId\",\"nomEntreprise\") values ($1,$2) returning id", [UID_B, "Upload B"])).rows[0].id;
    fileIdA = (await admin.query(
      "insert into files (artisan_id, storage_key, mime_type, size_bytes, sha256, purpose, bucket) values ($1,$2,$3,$4,$5,$6,$7) returning id",
      [artisanA, `chat/${artisanA}/test.jpg`, "image/jpeg", 1024, "abc123", "assistant-chat", "test-bucket"],
    )).rows[0].id;
  });

  afterAll(cleanup);

  it("withTenant(A) lit le fichier de A", async () => {
    const rows = await withTenant(app.db, ctx(artisanA), (tx) =>
      tx.select({ id: files.id }).from(files).where(inArray(files.id, [fileIdA])),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(fileIdA);
  });

  it("withTenant(B) ne voit PAS le fichier de A (anti-IDOR)", async () => {
    const rows = await withTenant(app.db, ctx(artisanB), (tx) =>
      tx.select({ id: files.id }).from(files).where(inArray(files.id, [fileIdA])),
    );
    expect(rows).toHaveLength(0);
  });

  it("withTenant(B) ne peut pas INSERT dans message_files avec artisan_id=A (RLS check)", async () => {
    await expect(
      withTenant(app.db, ctx(artisanB), (tx) =>
        tx.insert(messageFiles).values({ conversationId: "1", messageIndex: 0, fileId: fileIdA, artisanId: artisanA }),
      ),
    ).rejects.toThrow();
  });

  it("withTenant(A) peut INSERT dans message_files avec artisan_id=A", async () => {
    await expect(
      withTenant(app.db, ctx(artisanA), (tx) =>
        tx.insert(messageFiles).values({ conversationId: "1", messageIndex: 0, fileId: fileIdA, artisanId: artisanA }),
      ),
    ).resolves.toBeDefined();
  });
});

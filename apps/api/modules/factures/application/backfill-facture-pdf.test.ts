import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { files } from "../../../../../drizzle/schema/files";
import { factures } from "../../../../../drizzle/schema/factures";
import { backfillFacturePdf } from "./backfill-facture-pdf";
import type { StoragePort, StoredFile, UploadOptions } from "../../../shared/ports/storage";
import type { PdfPort } from "../../../shared/ports/pdf";
import type { DbClient } from "../../../shared/db";

const DB_URL = process.env.DATABASE_URL;

/** Insère une vraie ligne dans `files` (pas d'upload S3) — respecte la FK `pdfFileId`. */
class DbFakeStorage implements StoragePort {
  readonly uploaded: { key: string; artisanId?: number }[] = [];
  constructor(private readonly db: DbClient) {}
  withDb(db: DbClient): DbFakeStorage { return new DbFakeStorage(db); }
  async upload(key: string, body: Buffer, opts?: UploadOptions): Promise<StoredFile> {
    const sha256 = createHash("sha256").update(body).digest("hex");
    const [row] = await this.db.insert(files).values({
      artisanId: opts?.artisanId ?? null,
      storageKey: key,
      filename: opts?.filename ?? null,
      mimeType: opts?.contentType ?? "application/octet-stream",
      sizeBytes: body.byteLength,
      sha256,
      purpose: opts?.purpose ?? "unknown",
      bucket: "test",
    }).returning();
    this.uploaded.push({ key, artisanId: opts?.artisanId });
    return row;
  }
  async get(_key: string): Promise<Buffer | null> { return null; }
  async delete(_key: string): Promise<void> {}
  async url(key: string): Promise<string> { return `test://${key}`; }
}

const fakePdf: PdfPort = {
  render(_template: string, _data: Record<string, unknown>): Promise<Buffer> {
    return Promise.resolve(Buffer.from("fake-pdf-content"));
  },
};

/* Plage d'ids UNIQUE à ce fichier (collision évitée en run parallèle) */
const ART_A = 9960001;
const ART_B = 9960002;
const USER_A = 9960003;
const USER_B = 9960004;

describe.skipIf(!DB_URL)("backfillFacturePdf (L2 PG)", () => {
  const admin = new Pool({ connectionString: DB_URL });
  const db = drizzle(admin) as DbClient;
  const storage = new DbFakeStorage(db);

  let clientA = 0;
  let clientB = 0;
  let factureEmise = 0;
  let facturePayeeB = 0;
  let factureDejaBackfillée = 0;
  let factureBrouillon = 0;
  let existingFileId = 0;

  const cleanup = async () => {
    await admin.query(`delete from factures where "artisanId" in ($1,$2)`, [ART_A, ART_B]);
    await admin.query(`delete from files where storage_key like 'factures/9960%'`);
    await admin.query(`delete from clients where "artisanId" in ($1,$2)`, [ART_A, ART_B]);
    await admin.query(`delete from artisans where id in ($1,$2)`, [ART_A, ART_B]);
    await admin.query(`delete from users where id in ($1,$2)`, [USER_A, USER_B]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query(
      `insert into users (id,email,password,role) values ($1,$2,'x','artisan'),($3,$4,'x','artisan')`,
      [USER_A, `u${USER_A}@t.fr`, USER_B, `u${USER_B}@t.fr`],
    );
    await admin.query(
      `insert into artisans (id,"userId") values ($1,$2),($3,$4)`,
      [ART_A, USER_A, ART_B, USER_B],
    );
    clientA = (await admin.query(
      `insert into clients ("artisanId",nom) values ($1,'Client A') returning id`,
      [ART_A],
    )).rows[0].id as number;
    clientB = (await admin.query(
      `insert into clients ("artisanId",nom) values ($1,'Client B') returning id`,
      [ART_B],
    )).rows[0].id as number;

    /* facture émise sans pdfFileId → doit être traitée */
    factureEmise = (await admin.query(
      `insert into factures ("artisanId","clientId",numero,statut,"updatedAt") values ($1,$2,'FAC-BF-001','envoyee',now()) returning id`,
      [ART_A, clientA],
    )).rows[0].id as number;

    /* facture payée (autre tenant) sans pdfFileId → doit être traitée */
    facturePayeeB = (await admin.query(
      `insert into factures ("artisanId","clientId",numero,statut,"updatedAt") values ($1,$2,'FAC-BF-002','payee',now()) returning id`,
      [ART_B, clientB],
    )).rows[0].id as number;

    /* facture avec pdfFileId déjà posé → skip idempotent */
    existingFileId = (await admin.query(
      `insert into files (artisan_id,storage_key,mime_type,size_bytes,sha256,purpose,bucket)
       values ($1,'factures/9960001/existing.pdf','application/pdf',10,$2,'facture-pdf','test') returning id`,
      [ART_A, "a".repeat(64)],
    )).rows[0].id as number;
    factureDejaBackfillée = (await admin.query(
      `insert into factures ("artisanId","clientId",numero,statut,"pdfFileId","updatedAt") values ($1,$2,'FAC-BF-003','envoyee',$3,now()) returning id`,
      [ART_A, clientA, existingFileId],
    )).rows[0].id as number;

    /* brouillon → jamais touché */
    factureBrouillon = (await admin.query(
      `insert into factures ("artisanId","clientId",numero,statut,"updatedAt") values ($1,$2,'FAC-BF-004','brouillon',now()) returning id`,
      [ART_A, clientA],
    )).rows[0].id as number;
  });

  afterAll(async () => {
    await cleanup();
    await admin.end();
  });

  it("pose pdfFileId sur factures émises sans PDF ; skip idempotent et brouillon ignoré", async () => {
    const result = await backfillFacturePdf(db, storage, fakePdf);

    expect(result.erreurs).toBe(0);
    expect(result.traites).toBeGreaterThanOrEqual(2);

    /* ART_A envoyée → pdfFileId posé, storageKey dans files */
    const rowEmise = (await admin.query(
      `select "pdfFileId","pdfStorageKey" from factures where id = $1`,
      [factureEmise],
    )).rows[0] as { pdfFileId: number | null; pdfStorageKey: string | null };
    expect(rowEmise.pdfFileId).not.toBeNull();
    expect(rowEmise.pdfStorageKey).toMatch(/^factures\//);

    /* RLS : file créé avec le bon artisanId */
    const fileRow = await db.select().from(files).where(eq(files.id, rowEmise.pdfFileId!)).limit(1);
    expect(fileRow[0]?.artisanId).toBe(ART_A);

    /* ART_B payée → pdfFileId posé */
    const rowPayeeB = (await admin.query(
      `select "pdfFileId" from factures where id = $1`,
      [facturePayeeB],
    )).rows[0] as { pdfFileId: number | null };
    expect(rowPayeeB.pdfFileId).not.toBeNull();

    /* déjà backfillée → pdfFileId inchangé */
    const rowExist = (await admin.query(
      `select "pdfFileId" from factures where id = $1`,
      [factureDejaBackfillée],
    )).rows[0] as { pdfFileId: number | null };
    expect(rowExist.pdfFileId).toBe(existingFileId);

    /* brouillon → toujours null */
    const rowBrouillon = (await admin.query(
      `select "pdfFileId" from factures where id = $1`,
      [factureBrouillon],
    )).rows[0] as { pdfFileId: number | null };
    expect(rowBrouillon.pdfFileId).toBeNull();
  });

  it("idempotence : 2e run = 0 traités, 0 erreurs", async () => {
    const uploadCountBefore = storage.uploaded.length;
    const result = await backfillFacturePdf(db, storage, fakePdf);
    expect(result.erreurs).toBe(0);
    expect(result.traites).toBe(0);
    expect(storage.uploaded.length).toBe(uploadCountBefore);
  });
});

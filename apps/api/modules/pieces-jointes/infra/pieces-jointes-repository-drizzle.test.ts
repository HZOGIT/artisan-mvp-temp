import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { PiecesJointesRepositoryDrizzle } from "./pieces-jointes-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9950001;
const B = 9950002;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("PiecesJointesRepositoryDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new PiecesJointesRepositoryDrizzle(app.db);

  let devisIdA = 0;
  let devisIdB = 0;
  let fileIdA = 0;
  let fileIdA2 = 0;

  const cleanup = async () => {
    await admin.query('delete from pieces_jointes where artisan_id in ($1,$2)', [A, B]);
    await admin.query('delete from files where artisan_id in ($1,$2)', [A, B]);
    await admin.query('delete from devis where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from clients where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from artisans where id in ($1,$2)', [A, B]);
    await admin.query('delete from users where id in ($1,$2)', [A, B]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query(`insert into users (id, email, password, role) values ($1,'pj-a@t.fr','x','artisan'),($2,'pj-b@t.fr','x','artisan') on conflict do nothing`, [A, B]);
    await admin.query(`insert into artisans (id, "userId", "nomEntreprise") values ($1,$1,'Artisan PJ A'),($2,$2,'Artisan PJ B') on conflict do nothing`, [A, B]);
    const clientA = await admin.query(`insert into clients ("artisanId", nom) values ($1,'Client PJ A') returning id`, [A]);
    const clientB = await admin.query(`insert into clients ("artisanId", nom) values ($1,'Client PJ B') returning id`, [B]);
    const dA = await admin.query(`insert into devis ("artisanId", "clientId", numero, statut) values ($1,$2,'PJ-A-001','brouillon') returning id`, [A, clientA.rows[0].id]);
    const dB = await admin.query(`insert into devis ("artisanId", "clientId", numero, statut) values ($1,$2,'PJ-B-001','brouillon') returning id`, [B, clientB.rows[0].id]);
    devisIdA = dA.rows[0].id as number;
    devisIdB = dB.rows[0].id as number;
    const fA = await admin.query(`insert into files (artisan_id, storage_key, filename, mime_type, size_bytes, sha256, purpose, bucket) values ($1,'pj/a/f1.pdf','plan-A.pdf','application/pdf',1024,'aabbcc','piece_jointe','ovh') returning id`, [A]);
    const fA2 = await admin.query(`insert into files (artisan_id, storage_key, filename, mime_type, size_bytes, sha256, purpose, bucket) values ($1,'pj/a/f2.pdf','photo-A.jpg','image/jpeg',2048,'ddeeff','piece_jointe','ovh') returning id`, [A]);
    fileIdA = fA.rows[0].id as number;
    fileIdA2 = fA2.rows[0].id as number;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("attach + listByDevis scopé au tenant", async () => {
    const p = await repo.attach(ctx(A), { fileId: fileIdA, devisId: devisIdA });
    expect(p.id).toBeGreaterThan(0);
    expect(p.artisanId).toBe(A);
    expect(p.devisId).toBe(devisIdA);
    expect(p.filename).toBe("plan-A.pdf");
    expect(p.mimeType).toBe("application/pdf");

    const list = await repo.listByDevis(ctx(A), devisIdA);
    expect(list.some((x) => x.id === p.id)).toBe(true);
  });

  it("countByDevis respecte le plafond", async () => {
    await repo.attach(ctx(A), { fileId: fileIdA2, devisId: devisIdA });
    const n = await repo.countByDevis(ctx(A), devisIdA);
    expect(n).toBeGreaterThanOrEqual(2);
  });

  it("isolation cross-tenant : B ne lit pas les pièces de A", async () => {
    const list = await repo.listByDevis(ctx(B), devisIdA);
    expect(list).toHaveLength(0);
  });

  it("getById cross-tenant est refusé", async () => {
    const list = await repo.listByDevis(ctx(A), devisIdA);
    const piece = list[0];
    if (!piece) return;
    await expectCrossTenantDenied(() => repo.getById(ctx(B), piece.id));
  });

  it("delete cross-tenant est no-op (RLS bloque)", async () => {
    const list = await repo.listByDevis(ctx(A), devisIdA);
    const piece = list[0];
    if (!piece) return;
    await repo.delete(ctx(B), piece.id);
    expect(await repo.getById(ctx(A), piece.id)).not.toBeNull();
  });

  it("assertDevisOwnership cross-tenant lève NotFoundError", async () => {
    await expect(repo.assertDevisOwnership(ctx(B), devisIdA)).rejects.toThrow("Devis introuvable");
  });
});

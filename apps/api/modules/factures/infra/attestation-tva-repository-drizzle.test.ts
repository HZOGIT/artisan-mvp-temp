import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { AttestationTvaRepositoryDrizzle } from "./attestation-tva-repository-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

/** Plage d'ids UNIQUE à ce fichier — évite la collision cross-fichiers. */
const A = 9940101;
const B = 9940102;
const UA = 9940103;
const UB = 9940104;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("AttestationTvaRepositoryDrizzle (PG, RLS isolation)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new AttestationTvaRepositoryDrizzle(app.db);
  let clientA = 0;
  let factureA = 0;
  let factureB = 0;

  const cleanup = async () => {
    await admin.query('delete from attestations_tva where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from factures_lignes where "factureId" in (select id from factures where "artisanId" in ($1,$2))', [A, B]);
    await admin.query('delete from factures where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from clients where "artisanId" in ($1,$2)', [A, B]);
    await admin.query("delete from users where id in ($1,$2)", [UA, UB]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UB, `u${UB}@t.fr`]);
    clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [A, "Client A"])).rows[0].id;
    const clientB = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [B, "Client B"])).rows[0].id;
    factureA = (await admin.query(
      'insert into factures ("artisanId","clientId","numero") values ($1,$2,\'FAT-L2-001\') returning id',
      [A, clientA],
    )).rows[0].id;
    factureB = (await admin.query(
      'insert into factures ("artisanId","clientId","numero") values ($1,$2,\'FAT-L2-002\') returning id',
      [B, clientB],
    )).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("create + listByFacture : crée une attestation et la retrouve pour le bon tenant", async () => {
    const att = await repo.create(ctx(A), { artisanId: A, factureId: factureA, s3Key: "attestations-tva/test/a.pdf" });
    expect(att.id).toBeGreaterThan(0);
    expect(att.statut).toBe("genere");

    const list = await repo.listByFacture(ctx(A), factureA);
    expect(list.some((r) => r.id === att.id)).toBe(true);
  });

  it("isolation RLS : l'artisan B ne voit pas les attestations de A", async () => {
    const list = await repo.listByFacture(ctx(B), factureA);
    expect(list).toHaveLength(0);
  });

  it("attacherSignee : met à jour statut=signe et signedS3Key", async () => {
    const att = await repo.create(ctx(A), { artisanId: A, factureId: factureA, s3Key: "attestations-tva/test/b.pdf" });
    const updated = await repo.attacherSignee(ctx(A), att.id, "attestations-tva/test/signed-b.pdf");
    expect(updated.statut).toBe("signe");
    expect(updated.signedS3Key).toBe("attestations-tva/test/signed-b.pdf");
  });

  it("hasSigned : true si attestation signée présente, false sinon", async () => {
    const attUnsigned = await repo.create(ctx(A), { artisanId: A, factureId: factureA, s3Key: "attestations-tva/test/c.pdf" });
    expect(await repo.hasSigned(ctx(A), factureA)).toBe(true); /* une signée créée ci-dessus */

    const fakeId = factureB;
    expect(await repo.hasSigned(ctx(A), fakeId)).toBe(false); /* facture B hors tenant A */
  });
});

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { SignatureRepositoryDrizzle } from "./signature-repository-drizzle";

const URL = process.env.DATABASE_URL;
const UID = 9965361;
const TOKEN = "sigrepo-9965361-xxxxxxxxxxxxxxxxxxxxxxxxxx";

// L2 persistance `signatures_devis` (HORS RLS — pas d'artisanId ; anti-IDOR porté en amont par le
// use-case). Vérifie create (défauts), round-trip getByToken/getByDevisId, et null si absent.
describe.skipIf(!URL)("SignatureRepositoryDrizzle (persistance signatures_devis)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(URL!);
  const repo = new SignatureRepositoryDrizzle(app.db);
  let artisanId = 0;
  let devisId = 0;

  const cleanup = async () => {
    await admin.query("delete from signatures_devis where token = $1", [TOKEN]);
    await admin.query('delete from devis where "artisanId" in (select id from artisans where "userId" = $1)', [UID]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId" = $1)', [UID]);
    await admin.query('delete from artisans where "userId" = $1', [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    artisanId = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID, "Sig Repo"])).rows[0].id;
    const clientId = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanId, "C"])).rows[0].id;
    devisId = (await admin.query('insert into devis ("artisanId","clientId",numero,statut) values ($1,$2,$3,$4) returning id', [artisanId, clientId, `SR-${UID}`, "envoye"])).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("create : insère + renvoie la signature avec les défauts (statut en_attente)", async () => {
    const sig = await repo.create({ artisanId, devisId, token: TOKEN, expiresAt: new Date(Date.now() + 30 * 86400000) });
    expect(sig.token).toBe(TOKEN);
    expect(sig.devisId).toBe(devisId);
    expect(sig.statut).toBe("en_attente");
    expect(sig.signatureData).toBeNull();
    expect(sig.signedAt).toBeNull();
  });

  it("getByToken / getByDevisId : round-trip vers la signature créée", async () => {
    expect((await repo.getByToken(TOKEN))?.devisId).toBe(devisId);
    expect((await repo.getByDevisId(devisId))?.token).toBe(TOKEN);
  });

  it("token / devisId inconnus → null", async () => {
    expect(await repo.getByToken("absent-zzzzzzzzzzzzzzzzzzzzzzzzzzzz")).toBeNull();
    expect(await repo.getByDevisId(987654321)).toBeNull();
  });
});

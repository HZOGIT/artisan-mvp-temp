import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { DevisSignatureReaderDrizzle } from "./devis-signature-reader-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID = 9949201;
const TOKEN = "devsigreader-9949201-xxxxxxxxxxxxxxxxxxxx";
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 0 });

// L2 : lecture d'une signature par devisId (`signatures_devis`, SANS RLS/artisanId — scoping porté par
// le devis parent en amont). Vérifie le round-trip (id/token/createdAt) et le null si pas de signature.
describe.skipIf(!URL)("DevisSignatureReaderDrizzle (lecture signature par devisId)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new DevisSignatureReaderDrizzle(app.db);
  let artisanId = 0;
  let devisSigne = 0;
  let devisNonSigne = 0;

  const cleanup = async () => {
    await admin.query('delete from signatures_devis where token = $1', [TOKEN]);
    await admin.query('delete from devis where "artisanId" in (select id from artisans where "userId" = $1)', [UID]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId" = $1)', [UID]);
    await admin.query('delete from artisans where "userId" = $1', [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    artisanId = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID, "DevSig"])).rows[0].id;
    const clientId = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanId, "C"])).rows[0].id;
    devisSigne = (await admin.query('insert into devis ("artisanId","clientId",numero,statut) values ($1,$2,$3,$4) returning id', [artisanId, clientId, "DSR-1", "accepte"])).rows[0].id;
    devisNonSigne = (await admin.query('insert into devis ("artisanId","clientId",numero,statut) values ($1,$2,$3,$4) returning id', [artisanId, clientId, "DSR-2", "envoye"])).rows[0].id;
    await admin.query('insert into signatures_devis ("devisId",token,"expiresAt") values ($1,$2,$3)', [devisSigne, TOKEN, new Date(Date.now() + 30 * 86400000)]);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("getByDevisId : renvoie la signature (id/token/createdAt) du devis signé", async () => {
    const r = await reader.getByDevisId(ctx(artisanId), devisSigne);
    expect(r?.token).toBe(TOKEN);
    expect(r?.id).toBeTruthy();
    expect(r?.createdAt).toBeInstanceOf(Date);
  });

  it("devis sans signature → null", async () => {
    expect(await reader.getByDevisId(ctx(artisanId), devisNonSigne)).toBeNull();
    expect(await reader.getByDevisId(ctx(artisanId), 987654321)).toBeNull();
  });
});

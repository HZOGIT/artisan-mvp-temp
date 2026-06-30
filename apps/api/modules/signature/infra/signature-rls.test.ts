import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import { createDbClient } from "../../../shared/db";
import { signaturesDevis } from "../../../../../drizzle/schema.pg";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID_A = 9952001;
const UID_B = 9952002;
const TOKEN_A = "sig-rls-a-9952001-xxxxxxxxxxxxxxxxxxxxxxxxxxx";
const TOKEN_B = "sig-rls-b-9952002-xxxxxxxxxxxxxxxxxxxxxxxxxxx";

/**
 * Vérifie que FORCE ROW LEVEL SECURITY sur `signatures_devis` bloque l'énumération cross-tenant :
 * un attaquant `app_tenant` sans GUC posé ne voit aucune ligne, et un token ne révèle pas
 * les signatures d'un autre artisan.
 */
describe.skipIf(!URL)("signatures_devis — RLS anti-énumération (OPE-997)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);

  let artisanA = 0;
  let artisanB = 0;

  const cleanup = async () => {
    await admin.query("delete from signatures_devis where token in ($1,$2)", [TOKEN_A, TOKEN_B]);
    await admin.query('delete from devis where "artisanId" in (select id from artisans where "userId" in ($1,$2))', [UID_A, UID_B]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId" in ($1,$2))', [UID_A, UID_B]);
    await admin.query('delete from artisans where "userId" in ($1,$2)', [UID_A, UID_B]);
  };

  const seed = async (userId: number) => {
    const id = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [userId, `RLS-${userId}`])).rows[0].id as number;
    const clientId = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [id, "C"])).rows[0].id as number;
    const devisId = (await admin.query('insert into devis ("artisanId","clientId",numero) values ($1,$2,$3) returning id', [id, clientId, `RLS-${userId}`])).rows[0].id as number;
    return { artisanId: id, devisId };
  };

  beforeAll(async () => {
    await cleanup();
    ({ artisanId: artisanA } = await seed(UID_A));
    ({ artisanId: artisanB } = await seed(UID_B));
    const devisA = (await admin.query('select id from devis where "artisanId"=$1 limit 1', [artisanA])).rows[0].id as number;
    const devisB = (await admin.query('select id from devis where "artisanId"=$1 limit 1', [artisanB])).rows[0].id as number;
    await admin.query('insert into signatures_devis ("artisanId","devisId",token,"expiresAt") values ($1,$2,$3,now()+interval \'30 days\')', [artisanA, devisA, TOKEN_A]);
    await admin.query('insert into signatures_devis ("artisanId","devisId",token,"expiresAt") values ($1,$2,$3,now()+interval \'30 days\')', [artisanB, devisB, TOKEN_B]);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("app_tenant sans GUC → 0 ligne (FORCE RLS bloque l'énumération)", async () => {
    /* ponytail: raw SQL pour tester exactement le comportement sans withTenant ni withPublicToken */
    const rows = await app.db.select().from(signaturesDevis);
    expect(rows).toHaveLength(0);
  });

  it("app_tenant + app.public_token=TOKEN_A → signature A uniquement", async () => {
    const rows = await app.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.public_token', ${TOKEN_A}, true)`);
      return tx.select().from(signaturesDevis);
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].token).toBe(TOKEN_A);
    expect(rows[0].artisanId).toBe(artisanA);
  });

  it("app_tenant + app.public_token=TOKEN_A → ne voit pas TOKEN_B (isolation cross-tenant)", async () => {
    const rows = await app.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.public_token', ${TOKEN_A}, true)`);
      return tx.select().from(signaturesDevis);
    });
    expect(rows.some((r) => r.token === TOKEN_B)).toBe(false);
  });

  it("app_tenant + app.tenant=artisanA → signature A visible, signature B invisible", async () => {
    const rows = await app.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant', ${String(artisanA)}, true)`);
      return tx.select().from(signaturesDevis);
    });
    expect(rows.some((r) => r.token === TOKEN_A)).toBe(true);
    expect(rows.some((r) => r.token === TOKEN_B)).toBe(false);
  });
});

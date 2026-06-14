import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { PublicDemandeAvisReaderDrizzle } from "./public-demande-reader-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

// Tenants distincts (anti-collision run parallèle).
const A = 9921011;
const B = 9921012;
const TOKEN_A = "pub-token-A-9921011-xxxxxxxxxxxxxxxxxxxxxx";
const TOKEN_B = "pub-token-B-9921012-xxxxxxxxxxxxxxxxxxxxxx";

// ⚠️ Ce test valide la **policy RLS publique** (`public_token_select`) : le rôle non-superuser
// `app_tenant`, SANS contexte tenant, ne voit QUE la demande dont le token est présenté.
describe.skipIf(!URL)("PublicDemandeAvisReaderDrizzle (RLS accès public par token)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new PublicDemandeAvisReaderDrizzle(app.db);

  const cleanup = async () => {
    await admin.query('delete from demandes_avis where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from clients where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from interventions where "artisanId" in ($1,$2)', [A, B]);
  };

  const seedDemande = async (artisanId: number, token: string): Promise<number> => {
    const clientId = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanId, "C"])).rows[0].id;
    const interventionId = (
      await admin.query('insert into interventions ("artisanId","clientId",titre,"dateDebut") values ($1,$2,$3,now()) returning id', [artisanId, clientId, "I"])
    ).rows[0].id;
    const { rows } = await admin.query(
      'insert into demandes_avis ("artisanId","clientId","interventionId","tokenDemande","expiresAt") values ($1,$2,$3,$4, now() + interval \'14 days\') returning id',
      [artisanId, clientId, interventionId, token],
    );
    return rows[0].id as number;
  };

  beforeAll(async () => {
    await cleanup();
    await seedDemande(A, TOKEN_A);
    await seedDemande(B, TOKEN_B);
  });
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("le bon token → la demande correspondante (app_tenant sans contexte tenant)", async () => {
    const d = await reader.getByToken(TOKEN_A);
    expect(d?.artisanId).toBe(A);
    expect(d?.statut).toBe("envoyee"); // défaut PG
  });

  it("un token inconnu → null (anti-oracle)", async () => {
    expect(await reader.getByToken("token-inexistant-zzzzzzzzzzzzzzzzzzzz")).toBeNull();
  });

  it("présenter le token de A ne révèle PAS la demande de B (capacité stricte par token)", async () => {
    const d = await reader.getByToken(TOKEN_A);
    expect(d?.artisanId).toBe(A);
    expect(d?.artisanId).not.toBe(B);
  });
});

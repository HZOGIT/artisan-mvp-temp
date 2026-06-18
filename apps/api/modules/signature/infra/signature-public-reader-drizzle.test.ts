import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { SignaturePublicReaderDrizzle } from "./signature-public-reader-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

// userId uniques (artisans.userId NOT NULL UNIQUE) anti-collision run parallèle.
const UID_A = 9931021;
const UID_B = 9931022;
const TOKEN_A = "sig-token-A-9931021-xxxxxxxxxxxxxxxxxxxxxxxx";
const TOKEN_B = "sig-token-B-9931022-xxxxxxxxxxxxxxxxxxxxxxxx";

// ⚠️ Valide la **policy RLS publique** `public_token_select` SUR `devis` : le rôle non-superuser
// `app_tenant`, SANS contexte tenant, ne résout QUE le devis rattaché à la signature dont le token
// est présenté (`signatures_devis` étant HORS RLS). Puis la vue se lit sous le tenant résolu.
describe.skipIf(!URL)("SignaturePublicReaderDrizzle (RLS accès public par token sur devis)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new SignaturePublicReaderDrizzle(app.db);

  let artisanA = 0;
  let artisanB = 0;
  let devisA = 0;

  const cleanup = async () => {
    await admin.query('delete from signatures_devis where token in ($1,$2)', [TOKEN_A, TOKEN_B]);
    await admin.query('delete from devis_lignes where "devisId" in (select id from devis where "artisanId" in (select id from artisans where "userId" in ($1,$2)))', [UID_A, UID_B]);
    await admin.query('delete from devis where "artisanId" in (select id from artisans where "userId" in ($1,$2))', [UID_A, UID_B]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId" in ($1,$2))', [UID_A, UID_B]);
    await admin.query('delete from artisans where "userId" in ($1,$2)', [UID_A, UID_B]);
  };

  const seed = async (userId: number, nomEntreprise: string, token: string) => {
    const artisanId = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [userId, nomEntreprise])).rows[0].id;
    const clientId = (await admin.query('insert into clients ("artisanId",nom,email) values ($1,$2,$3) returning id', [artisanId, "Client", "c@test.com"])).rows[0].id;
    const devisId = (await admin.query('insert into devis ("artisanId","clientId",numero,"totalTTC") values ($1,$2,$3,$4) returning id', [artisanId, clientId, `SIG-${userId}`, "1200.00"])).rows[0].id;
    await admin.query('insert into devis_lignes ("devisId",designation,"prixUnitaireHT") values ($1,$2,$3)', [devisId, "Ligne 1", "1000.00"]);
    await admin.query('insert into signatures_devis ("devisId",token,"expiresAt") values ($1,$2, now() + interval \'30 days\')', [devisId, token]);
    return { artisanId, devisId };
  };

  beforeAll(async () => {
    await cleanup();
    ({ artisanId: artisanA, devisId: devisA } = await seed(UID_A, "Toiture A", TOKEN_A));
    ({ artisanId: artisanB } = await seed(UID_B, "Toiture B", TOKEN_B));
  });
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("le bon token résout la signature + le devis rattaché (artisanId), app_tenant sans contexte", async () => {
    const r = await reader.resolveByToken(TOKEN_A);
    expect(r?.artisanId).toBe(artisanA);
    expect(r?.devisId).toBe(devisA);
    expect(r?.signature.statut).toBe("en_attente");
    expect(r?.signature.token).toBe(TOKEN_A);
  });

  it("un token inconnu → null (anti-oracle)", async () => {
    expect(await reader.resolveByToken("token-inexistant-zzzzzzzzzzzzzzzzzzzzzz")).toBeNull();
  });

  it("la vue (sous le tenant résolu) renvoie devis+client+lignes scopés", async () => {
    const r = await reader.resolveByToken(TOKEN_A);
    const view = await reader.getDevisView({ artisanId: r!.artisanId, userId: 0 }, r!.devisId);
    expect(view?.devis.numero).toBe(`SIG-${UID_A}`);
    expect(view?.client?.email).toBe("c@test.com");
    expect(view?.lignes).toHaveLength(1);
    expect(view?.lignes[0].designation).toBe("Ligne 1");
  });

  it("présenter le token de A ne révèle PAS le devis de B (capacité stricte par token)", async () => {
    const r = await reader.resolveByToken(TOKEN_A);
    expect(r?.artisanId).toBe(artisanA);
    expect(r?.artisanId).not.toBe(artisanB);
  });
});

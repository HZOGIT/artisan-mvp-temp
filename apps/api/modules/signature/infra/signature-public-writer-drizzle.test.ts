import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { SignaturePublicWriterDrizzle } from "./signature-public-writer-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID = 9941031;
const TOKEN = "sigw-token-9941031-xxxxxxxxxxxxxxxxxxxxxxxxxx";

// ⚠️ Valide les EFFETS d'écriture publics sous le rôle non-superuser `app_tenant` (RLS) :
// signature → accepte + devis → accepte EN TRANSACTION, capture IP/UA, **immutabilité/anti-rejeu**
// (2ᵉ signature sans effet), et sélection d'option (une seule selectionnee/devis).
describe.skipIf(!URL)("SignaturePublicWriterDrizzle (effets publics sous RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const writer = new SignaturePublicWriterDrizzle(app.db);

  let artisanId = 0;
  let devisId = 0;
  let opt1 = 0;
  let opt2 = 0;
  const ctx = (): TenantContext => ({ artisanId, userId: 0 });

  const cleanup = async () => {
    await admin.query('delete from signatures_devis where token = $1', [TOKEN]);
    await admin.query('delete from devis_options where "devisId" in (select id from devis where "artisanId" in (select id from artisans where "userId" = $1))', [UID]);
    await admin.query('delete from devis where "artisanId" in (select id from artisans where "userId" = $1)', [UID]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId" = $1)', [UID]);
    await admin.query('delete from artisans where "userId" = $1', [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    artisanId = (await admin.query('insert into artisans ("userId","nomEntreprise","email") values ($1,$2,$3) returning id', [UID, "W", "w@test.com"])).rows[0].id;
    const clientId = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanId, "C"])).rows[0].id;
    devisId = (await admin.query('insert into devis ("artisanId","clientId",numero,statut) values ($1,$2,$3,$4) returning id', [artisanId, clientId, `SIGW-${UID}`, "envoye"])).rows[0].id;
    await admin.query('insert into signatures_devis ("devisId",token,"expiresAt") values ($1,$2, now() + interval \'30 days\')', [devisId, TOKEN]);
    opt1 = (await admin.query('insert into devis_options ("devisId",nom) values ($1,$2) returning id', [devisId, "Standard"])).rows[0].id;
    opt2 = (await admin.query('insert into devis_options ("devisId",nom) values ($1,$2) returning id', [devisId, "Premium"])).rows[0].id;
  });
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("signDevis : signature accepte + devis accepte (transaction) + IP/UA capturés", async () => {
    const sig = await writer.signDevis(ctx(), {
      token: TOKEN,
      devisId,
      signatureData: "data:image/png;base64,AAA",
      signataireName: "Jean Dupont",
      signataireEmail: "jean@test.com",
      ipAddress: "203.0.113.7",
      userAgent: "Mozilla/5.0",
    });
    expect(sig.statut).toBe("accepte");
    expect(sig.ipAddress).toBe("203.0.113.7");
    expect(sig.signedAt).not.toBeNull();
    const { rows } = await admin.query("select statut from devis where id=$1", [devisId]);
    expect(rows[0].statut).toBe("accepte");
  });

  it("immutabilité/anti-rejeu : une 2ᵉ signature (autre IP) ne réécrit RIEN", async () => {
    const before = (await admin.query("select * from signatures_devis where token=$1", [TOKEN])).rows[0];
    const sig = await writer.signDevis(ctx(), {
      token: TOKEN,
      devisId,
      signatureData: "REJEU",
      signataireName: "Imposteur",
      signataireEmail: "evil@test.com",
      ipAddress: "10.0.0.1",
      userAgent: "evil",
    });
    // La garde SQL (statut='en_attente') empêche toute réécriture : l'état reste la 1ʳᵉ signature.
    expect(sig.signataireName).toBe("Jean Dupont");
    expect(sig.ipAddress).toBe("203.0.113.7");
    const after = (await admin.query("select * from signatures_devis where token=$1", [TOKEN])).rows[0];
    expect(after.signataireName).toBe(before.signataireName);
    expect(after.ipAddress).toBe(before.ipAddress);
  });

  it("getOptionDevisId : devisId pour une option du tenant, null sinon", async () => {
    expect(await writer.getOptionDevisId(ctx(), opt1)).toBe(devisId);
    expect(await writer.getOptionDevisId(ctx(), 99999999)).toBeNull();
  });

  it("selectOption : une seule option selectionnee par devis", async () => {
    await writer.selectOption(ctx(), devisId, opt1);
    let rows = (await admin.query('select id, selectionnee from devis_options where "devisId"=$1 order by id', [devisId])).rows;
    expect(rows.find((r) => r.id === opt1)?.selectionnee).toBe(true);
    expect(rows.find((r) => r.id === opt2)?.selectionnee).toBe(false);
    // bascule sur opt2 → opt1 repasse à false (reset des autres)
    await writer.selectOption(ctx(), devisId, opt2);
    rows = (await admin.query('select id, selectionnee from devis_options where "devisId"=$1 order by id', [devisId])).rows;
    expect(rows.find((r) => r.id === opt1)?.selectionnee).toBe(false);
    expect(rows.find((r) => r.id === opt2)?.selectionnee).toBe(true);
  });
});

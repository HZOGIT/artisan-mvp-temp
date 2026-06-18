import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { AssistantDataReaderDrizzle } from "./assistant-data-reader-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID_A = 9981071;
const UID_B = 9981072;

describe.skipIf(!URL)("AssistantDataReaderDrizzle (data générateurs IA, scopée tenant sous RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new AssistantDataReaderDrizzle(app.db);
  let artisanA = 0;
  let artisanB = 0;
  let devisB = 0;

  const cleanup = async () => {
    for (const uid of [UID_A, UID_B]) {
      await admin.query('delete from devis_lignes where "devisId" in (select id from devis where "artisanId" in (select id from artisans where "userId"=$1))', [uid]);
      await admin.query('delete from devis where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from articles_artisan where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from artisans where "userId"=$1', [uid]);
    }
  };

  beforeAll(async () => {
    await cleanup();
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UID_A])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UID_B])).rows[0].id;
    const clientA = (await admin.query('insert into clients ("artisanId",nom,prenom) values ($1,$2,$3) returning id', [artisanA, "Dupont", "Jean"])).rows[0].id;
    // A : 1 devis en attente (envoye), 1 article
    await admin.query('insert into devis ("artisanId","clientId",numero,statut,"totalTTC") values ($1,$2,$3,$4,$5)', [artisanA, clientA, "DA1", "envoye", "1000.00"]);
    await admin.query('insert into articles_artisan ("artisanId",reference,designation,unite,"prixUnitaireHT") values ($1,$2,$3,$4,$5)', [artisanA, "R1", "Pose carrelage", "m2", "45.00"]);
    // B : 1 devis (pour le test anti-IDOR de getDevisAnalyse)
    const clientB = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanB, "SecretB"])).rows[0].id;
    devisB = (await admin.query('insert into devis ("artisanId","clientId",numero,statut,"totalHT","totalTTC") values ($1,$2,$3,$4,$5,$6) returning id', [artisanB, clientB, "DB1", "envoye", "500.00", "600.00"])).rows[0].id;
  });
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("listDevisNonSignes : A voit son devis (avec client) ; format scopé tenant", async () => {
    const rows = await reader.listDevisNonSignes({ artisanId: artisanA, userId: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0].numero).toBe("DA1");
    expect(rows[0].clientNom).toBe("Jean Dupont");
  });

  it("getCatalogue : inclut les articles de l'artisan", async () => {
    const cat = await reader.getCatalogue({ artisanId: artisanA, userId: 0 });
    expect(cat).toContain("Pose carrelage - 45.00€/m2");
  });

  it("getDevisAnalyse : devis d'un AUTRE tenant → null (anti-IDOR)", async () => {
    const out = await reader.getDevisAnalyse({ artisanId: artisanA, userId: 0 }, devisB);
    expect(out).toBeNull();
  });

  it("getDevisAnalyse : devis du tenant B lu par B → data", async () => {
    const out = await reader.getDevisAnalyse({ artisanId: artisanB, userId: 0 }, devisB);
    expect(out?.numero).toBe("DB1");
    expect(out?.totalHT).toBe("500.00");
  });

  it("getTresorerie : renvoie des sections (isolation tenant)", async () => {
    const t = await reader.getTresorerie({ artisanId: artisanA, userId: 0 });
    expect(t.devisAcceptes).toBe(""); // A n'a pas de devis accepté
    expect(typeof t.facturesImpayees).toBe("string");
  });
});

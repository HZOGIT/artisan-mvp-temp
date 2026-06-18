import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { FactureReaderDrizzle } from "./facture-reader-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID_A = 9962331;
const UID_B = 9962332;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 0 });

// L2 RLS : reader des factures pour la génération FEC (écritures comptables). Scopé tenant (RLS +
// filtre artisanId) ; les lignes (sans artisanId) sont scopées via la facture parente. On vérifie le
// round-trip sous A et l'anti-IDOR cross-tenant (B → null/[]).
describe.skipIf(!URL)("FactureReaderDrizzle (RLS round-trip + anti-IDOR — FEC)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new FactureReaderDrizzle(app.db);
  let artisanA = 0;
  let artisanB = 0;
  let factureA = 0;

  const cleanup = async () => {
    const uids = [UID_A, UID_B];
    await admin.query('delete from factures_lignes where "factureId" in (select id from factures where "artisanId" in (select id from artisans where "userId" = any($1)))', [uids]);
    await admin.query('delete from factures where "artisanId" in (select id from artisans where "userId" = any($1))', [uids]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId" = any($1))', [uids]);
    await admin.query('delete from artisans where "userId" = any($1)', [uids]);
  };

  beforeAll(async () => {
    await cleanup();
    artisanA = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_A, "Ecr A"])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_B, "Ecr B"])).rows[0].id;
    const clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanA, "C"])).rows[0].id;
    factureA = (await admin.query('insert into factures ("artisanId","clientId",numero,statut,"totalHT","totalTVA","totalTTC") values ($1,$2,$3,$4,$5,$6,$7) returning id', [artisanA, clientA, "FEC-A", "payee", "800.00", "160.00", "960.00"])).rows[0].id;
    await admin.query('insert into factures_lignes ("factureId",designation,"prixUnitaireHT","tauxTVA","montantTVA") values ($1,$2,$3,$4,$5),($1,$6,$7,$8,$9)', [factureA, "L1", "500.00", "20.00", "100.00", "L2", "300.00", "10.00", "60.00"]);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("getFacture : round-trip sous A ; anti-IDOR (B → null) ; inconnu → null", async () => {
    const f = await reader.getFacture(ctx(artisanA), factureA);
    expect(f?.numero).toBe("FEC-A");
    expect(f?.statut).toBe("payee");
    expect(f?.totalTTC).toBe("960.00");
    expect(await reader.getFacture(ctx(artisanB), factureA)).toBeNull();
    expect(await reader.getFacture(ctx(artisanA), 987654321)).toBeNull();
  });

  it("getLignes : taux/montant TVA des lignes scopées via la facture parente ; B → []", async () => {
    const lignes = await reader.getLignes(ctx(artisanA), factureA);
    expect(lignes).toEqual([
      { tauxTVA: "20.00", montantTVA: "100.00" },
      { tauxTVA: "10.00", montantTVA: "60.00" },
    ]);
    expect(await reader.getLignes(ctx(artisanB), factureA)).toEqual([]);
  });
});

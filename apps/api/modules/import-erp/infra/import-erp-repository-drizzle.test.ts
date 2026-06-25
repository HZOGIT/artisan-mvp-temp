import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { ImportErpRepositoryDrizzle } from "./import-erp-repository-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID_A = 9955261;
const UID_B = 9955262;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 0 });

// L2 RLS : repository d'import ERP (clients/devis/factures sous tenant). Vérifie les listes scopées
// (anti-IDOR), la création client/devis (numéro serveur généré), la PRÉSERVATION du numéro légal de
// facture d'origine (sinon génération), et la liste des numéros de facture (anti-doublon import).
describe.skipIf(!URL)("ImportErpRepositoryDrizzle (RLS import ERP)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new ImportErpRepositoryDrizzle(app.db);
  let artisanA = 0;
  let artisanB = 0;
  let clientA = 0;

  const cleanup = async () => {
    const uids = [UID_A, UID_B];
    const sub = 'in (select id from artisans where "userId" = any($1))';
    await admin.query(`delete from factures where "artisanId" ${sub}`, [uids]);
    await admin.query(`delete from devis where "artisanId" ${sub}`, [uids]);
    await admin.query(`delete from clients where "artisanId" ${sub}`, [uids]);
    await admin.query(`delete from parametres_artisan where "artisanId" ${sub}`, [uids]);
    await admin.query('delete from artisans where "userId" = any($1)', [uids]);
  };

  beforeAll(async () => {
    await cleanup();
    artisanA = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_A, "Imp A"])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_B, "Imp B"])).rows[0].id;
    for (const aid of [artisanA, artisanB]) await admin.query('insert into parametres_artisan ("artisanId") values ($1)', [aid]);
    clientA = (await admin.query('insert into clients ("artisanId",nom,prenom,email) values ($1,$2,$3,$4) returning id', [artisanA, "Moreau", "Jean", "jean@cli.fr"])).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("listClients : scopé tenant (anti-IDOR — B ne voit pas le client de A)", async () => {
    const a = await repo.listClients(ctx(artisanA));
    expect(a.map((c) => c.nom)).toContain("Moreau");
    expect(await repo.listClients(ctx(artisanB))).toEqual([]);
  });

  it("createClient : persiste un client scopé (visible dans listClients)", async () => {
    await repo.createClient(ctx(artisanA), { nom: "Nouveau", email: "n@cli.fr", ville: "Nice" });
    const a = await repo.listClients(ctx(artisanA));
    expect(a.some((c) => c.nom === "Nouveau" && c.email === "n@cli.fr")).toBe(true);
  });

  it("createDevisLight : insère un devis avec numéro serveur généré, scopé artisan", async () => {
    await repo.createDevisLight(ctx(artisanA), {
      clientId: clientA, objet: "Import devis", statut: "accepte",
      dateDevis: new Date("2026-01-10"), dateValidite: new Date("2026-02-10"), totalTTC: "600.00",
    });
    const { rows } = await admin.query('select numero, "totalTTC", statut, "artisanId" from devis where "clientId"=$1', [clientA]);
    expect(rows).toHaveLength(1);
    expect(rows[0].artisanId).toBe(artisanA);
    expect(rows[0].totalTTC).toBe("600.00");
    expect(rows[0].numero).toBeTruthy(); // numéro généré serveur
  });

  it("createFactureLight : PRÉSERVE le numéro légal fourni ; en génère un si absent + crée ligne HT/TVA", async () => {
    await repo.createFactureLight(ctx(artisanA), {
      clientId: clientA, numero: "LEGACY-2024-007", objet: "Hist", statut: "payee",
      dateFacture: new Date("2024-03-01"), dateEcheance: new Date("2024-03-31"), totalTTC: "300.00",
    });
    await repo.createFactureLight(ctx(artisanA), {
      clientId: clientA, objet: "Sans numero", statut: "envoyee",
      dateFacture: new Date("2026-03-01"), dateEcheance: new Date("2026-03-31"), totalTTC: "150.00",
      lignes: [
        {
          designation: "Reprise historique",
          quantite: "1",
          prixUnitaireHT: "125.00",
          tauxTVA: "20.00",
          tvaCategorieId: "FR_20",
          montantHT: "125.00",
          montantTVA: "25.00",
        },
      ],
    });
    const numeros = await repo.listFactureNumeros(ctx(artisanA));
    expect(numeros).toContain("LEGACY-2024-007");
    expect(numeros.filter((n) => n !== "LEGACY-2024-007")).toHaveLength(1);
    expect(await repo.listFactureNumeros(ctx(artisanB))).toEqual([]);
    const generated = numeros.filter((n) => n !== "LEGACY-2024-007")[0];
    const { rows: lignes } = await admin.query(
      'select f.numero, f."totalTTC", l."montantHT", l."montantTVA", l."montantTTC" from factures f left join factures_lignes l on f.id = l."factureId" where f.numero = $1',
      [generated],
    );
    expect(lignes).toHaveLength(1);
    expect(lignes[0].totalTTC).toBe("150.00");
    expect(lignes[0].montantHT).toBe("125.00");
    expect(lignes[0].montantTVA).toBe("25.00");
    expect(lignes[0].montantTTC).toBe("150.00");
  });

  it("createFactureLight : dérive HT à partir de TTC (TTC=120 → HT=100, TVA=20)", async () => {
    await repo.createFactureLight(ctx(artisanA), {
      clientId: clientA, numero: "IMPORT-DERIVE-001", objet: "Import dérivé", statut: "brouillon",
      dateFacture: new Date("2026-01-15"), dateEcheance: new Date("2026-02-15"), totalTTC: "120.00",
      lignes: [
        {
          designation: "Reprise historique",
          quantite: "1",
          prixUnitaireHT: "100.00",
          tauxTVA: "20.00",
          tvaCategorieId: "FR_20",
          montantHT: "100.00",
          montantTVA: "20.00",
        },
      ],
    });
    const { rows } = await admin.query(
      'select f.numero, f."totalTTC", l."montantHT", l."montantTVA", l."montantTTC" from factures f left join factures_lignes l on f.id = l."factureId" where f.numero = $1',
      ["IMPORT-DERIVE-001"],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].totalTTC).toBe("120.00");
    expect(rows[0].montantHT).toBe("100.00");
    expect(rows[0].montantTVA).toBe("20.00");
    expect(rows[0].montantTTC).toBe("120.00");
  });

  it("createFactureLight : TVA 10% (TTC=110 → HT=100, TVA=10)", async () => {
    await repo.createFactureLight(ctx(artisanA), {
      clientId: clientA, numero: "IMPORT-DERIVE-002", objet: "Import 10% TVA", statut: "brouillon",
      dateFacture: new Date("2026-01-20"), dateEcheance: new Date("2026-02-20"), totalTTC: "110.00",
      lignes: [
        {
          designation: "Reprise historique",
          quantite: "1",
          prixUnitaireHT: "100.00",
          tauxTVA: "10.00",
          tvaCategorieId: "FR_10",
          montantHT: "100.00",
          montantTVA: "10.00",
        },
      ],
    });
    const { rows } = await admin.query(
      'select f.numero, f."totalTTC", l."montantHT", l."montantTVA", l."montantTTC", l."tvaCategorieId" from factures f left join factures_lignes l on f.id = l."factureId" where f.numero = $1',
      ["IMPORT-DERIVE-002"],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].totalTTC).toBe("110.00");
    expect(rows[0].montantHT).toBe("100.00");
    expect(rows[0].montantTVA).toBe("10.00");
    expect(rows[0].montantTTC).toBe("110.00");
    expect(rows[0].tvaCategorieId).toBe("FR_10");
  });
});

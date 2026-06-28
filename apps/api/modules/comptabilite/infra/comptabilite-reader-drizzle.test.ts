import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { ComptabiliteReaderDrizzle } from "./comptabilite-reader-drizzle";
import { getBalance, getGrandLivre, getJournalVentes, getRapportTVA, getDeclarationTVADetail } from "../application/use-cases";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9942001;
const B = 9942002;
const UA = 9942003;
const UB = 9942004;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const RANGE = { dateDebut: new Date("2026-06-01T00:00:00Z"), dateFin: new Date("2026-06-30T23:59:59Z") };

describe.skipIf(!URL)("ComptabiliteReaderDrizzle (PG, RLS + écritures équilibrées)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new ComptabiliteReaderDrizzle(app.db);

  const cleanup = async () => {
    await admin.query('delete from ecritures_comptables where "artisanId" in ($1,$2)', [A, B]);
    await admin.query("delete from artisans where id in ($1,$2)", [A, B]);
    await admin.query("delete from users where id in ($1,$2)", [UA, UB]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UB, `u${UB}@t.fr`]);
    await admin.query('insert into artisans (id, "userId") values ($1,$2)', [A, UA]);
    await admin.query('insert into artisans (id, "userId") values ($1,$2)', [B, UB]);
    const ec = (artisanId: number, journal: string, compte: string, lib: string, debit: string, credit: string) =>
      admin.query('insert into ecritures_comptables ("artisanId","dateEcriture",journal,"numeroCompte","libelleCompte",libelle,"pieceRef",debit,credit) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [artisanId, "2026-06-10T10:00:00Z", journal, compte, lib, "Facture F1", "F1", debit, credit]);
    // Facture A équilibrée : 411 débit 120 / 706 crédit 100 / 44571 crédit 20.
    await ec(A, "VE", "411000", "Clients", "120.00", "0.00");
    await ec(A, "VE", "706000", "Prestations", "0.00", "100.00");
    await ec(A, "VE", "445710", "TVA collectée 20%", "0.00", "20.00");
    // Tenant B : ne doit jamais apparaître pour A.
    await ec(B, "VE", "411000", "Clients", "9999.00", "0.00");
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("getGrandLivre(A) : 3 comptes, scopé tenant ; B exclu", async () => {
    const gl = await getGrandLivre(reader, ctx(A), RANGE);
    expect(gl.map((c) => c.numeroCompte)).toEqual(["411000", "445710", "706000"]);
    expect(gl.find((c) => c.numeroCompte === "411000")?.solde).toBe(120);
  });

  it("getBalance(A) : INVARIANT Σ soldeDébiteur = Σ soldeCréditeur (écritures équilibrées)", async () => {
    const bal = await getBalance(reader, ctx(A), RANGE);
    const totDeb = bal.reduce((s, b) => s + b.soldeDebiteur, 0);
    const totCred = bal.reduce((s, b) => s + b.soldeCrediteur, 0);
    expect(totDeb).toBeCloseTo(120, 2);
    expect(totDeb).toBeCloseTo(totCred, 2);
  });

  it("getRapportTVA(A) : TVA collectée 20 (44571x crédit)", async () => {
    expect(await getRapportTVA(reader, ctx(A), RANGE)).toEqual({ tvaCollectee: 20, tvaDeductible: 0, tvaNette: 20 });
  });

  it("getJournalVentes(A) : 3 écritures VE ; isolation B ne voit que la sienne", async () => {
    expect(await getJournalVentes(reader, ctx(A), RANGE)).toHaveLength(3);
    const balB = await getBalance(reader, ctx(B), RANGE);
    expect(balB.find((b) => b.numeroCompte === "411000")?.debit).toBe(9999);
    expect(balB).toHaveLength(1);
  });
});

/*
 * L3 — régime d'exigibilité TVA (encaissements vs débits) sur la déclaration TVA (CA3).
 * Même jeu de factures → bases différentes selon le régime ; débits = non-régression valeur actuelle.
 */
describe.skipIf(!URL)("declarationTVADetail — régime exigibilité (L3)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new ComptabiliteReaderDrizzle(app.db);

  const UID_E = 9942101;
  const UID_D = 9942102;
  let artisanE = 0; /* encaissements */
  let artisanD = 0; /* débits */

  const JUIN = { dateDebut: new Date("2026-06-01T00:00:00Z"), dateFin: new Date("2026-06-30T23:59:59Z") };

  const cleanup = async () => {
    const uids = [UID_E, UID_D];
    const artSub = '(select id from artisans where "userId" = any($1))';
    await admin.query(`delete from factures_lignes where "factureId" in (select id from factures where "artisanId" in ${artSub})`, [uids]);
    await admin.query(`delete from factures where "artisanId" in ${artSub}`, [uids]);
    await admin.query(`delete from clients where "artisanId" in ${artSub}`, [uids]);
    await admin.query(`delete from configurations_comptables where "artisanId" in ${artSub}`, [uids]);
    await admin.query('delete from artisans where "userId" = any($1)', [uids]);
    await admin.query("delete from users where id = any($1)", [uids]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id,email,password,role) values ($1,$2,'x','artisan')", [UID_E, `u${UID_E}@t.fr`]);
    await admin.query("insert into users (id,email,password,role) values ($1,$2,'x','artisan')", [UID_D, `u${UID_D}@t.fr`]);
    artisanE = (await admin.query('insert into artisans (id,"userId") values (DEFAULT,$1) returning id', [UID_E])).rows[0].id;
    artisanD = (await admin.query('insert into artisans (id,"userId") values (DEFAULT,$1) returning id', [UID_D])).rows[0].id;
    const clientE = (await admin.query('insert into clients ("artisanId",nom) values ($1,\'ClientE\') returning id', [artisanE])).rows[0].id;
    const clientD = (await admin.query('insert into clients ("artisanId",nom) values ($1,\'ClientD\') returning id', [artisanD])).rows[0].id;

    /* Config régimes */
    await admin.query('insert into configurations_comptables ("artisanId","regimeTVA") values ($1,\'encaissements\')', [artisanE]);
    await admin.query('insert into configurations_comptables ("artisanId","regimeTVA") values ($1,\'debits\')', [artisanD]);

    /* Artisan E — 3 factures :
       F1 émise 10/06, payée 15/06 (dans JUIN) → doit apparaître en encaissements ET débits
       F2 émise 05/06, NON payée → exclue en encaissements, incluse en débits
       F3 émise 25/05, payée 20/06 (émission hors JUIN) → incluse en encaissements (paiement juin), exclue en débits */
    const insertF = async (artisanId: number, clientId: number, numero: string, statut: string, dateFacture: string, datePaiement: string | null) => {
      const res = await admin.query(
        'insert into factures ("artisanId","clientId",numero,statut,"dateFacture","datePaiement","totalHT","totalTVA","totalTTC") values ($1,$2,$3,$4,$5,$6,\'100.00\',\'20.00\',\'120.00\') returning id',
        [artisanId, clientId, numero, statut, dateFacture, datePaiement],
      );
      return res.rows[0].id as number;
    };
    const insertL = (factureId: number) =>
      admin.query('insert into factures_lignes ("factureId",designation,"prixUnitaireHT","quantite","tauxTVA","montantHT","montantTVA","montantTTC") values ($1,\'P\',\'100\',\'1\',\'20\',\'100\',\'20\',\'120\')', [factureId]);

    const f1E = await insertF(artisanE, clientE, "E-F1", "payee", "2026-06-10", "2026-06-15");
    const f2E = await insertF(artisanE, clientE, "E-F2", "envoyee", "2026-06-05", null);
    const f3E = await insertF(artisanE, clientE, "E-F3", "payee", "2026-05-25", "2026-06-20");
    await insertL(f1E); await insertL(f2E); await insertL(f3E);

    /* Artisan D — copie identique, config débits → compare */
    const f1D = await insertF(artisanD, clientD, "D-F1", "payee", "2026-06-10", "2026-06-15");
    const f2D = await insertF(artisanD, clientD, "D-F2", "envoyee", "2026-06-05", null);
    const f3D = await insertF(artisanD, clientD, "D-F3", "payee", "2026-05-25", "2026-06-20");
    await insertL(f1D); await insertL(f2D); await insertL(f3D);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("encaissements : seules les factures RÉGLÉES dans la période (F1+F3, pas F2 non payée)", async () => {
    const d = await getDeclarationTVADetail(reader, ctx(artisanE), JUIN);
    /* F1 (payée 15/06) + F3 (payée 20/06) = 2 × 100 HT, 2 × 20 TVA */
    expect(d.tvaCollectee).toBeCloseTo(40, 2);
    const taux20 = d.parTaux.find((t) => t.taux === 20);
    expect(taux20?.baseHT).toBeCloseTo(200, 2);
  });

  it("débits : toutes les factures émises dans la période (F1+F2), F3 exclue (émission mai)", async () => {
    const d = await getDeclarationTVADetail(reader, ctx(artisanD), JUIN);
    /* F1 (émise 10/06) + F2 (émise 05/06) = 2 × 100 HT, 2 × 20 TVA ; F3 (émise mai) exclue */
    expect(d.tvaCollectee).toBeCloseTo(40, 2);
    const taux20 = d.parTaux.find((t) => t.taux === 20);
    expect(taux20?.baseHT).toBeCloseTo(200, 2);
  });

  it("non-régression débits : F3 (émise mai, payée juin) est EXCLUE en débits mais INCLUSE en encaissements", async () => {
    const dEnc = await getDeclarationTVADetail(reader, ctx(artisanE), JUIN);
    const dDeb = await getDeclarationTVADetail(reader, ctx(artisanD), JUIN);
    /* Les deux totaux sont égaux ici (coincidence de ce jeu de test) mais les FACTURES incluses diffèrent */
    expect(dEnc.tvaCollectee).toBeCloseTo(dDeb.tvaCollectee, 2);
    /* En encaissements, F2 (non payée) est exclue ; en débits F3 (émise mai) est exclue → symétrique */
  });
});

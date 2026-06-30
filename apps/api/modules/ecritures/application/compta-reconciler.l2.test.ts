/**
 * L2 — Compta reconciler (C1) : tests sous app_tenant (APP_DATABASE_URL) et owner (DATABASE_URL).
 *
 * Anti false-green : detect doit utiliser ownerDb (RLS-FORCE sur factures + ecritures_comptables).
 * Test rls-guard prouve que app_tenant sans SET app.tenant = 0 lignes → ownerDb obligatoire.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import type { DbClient, DbHandle } from "../../../shared/db";
import { runComptaReconciler } from "./compta-reconciler";
import type { Anomalie } from "../../../platform/scheduler";

const DB_URL = process.env.DATABASE_URL;
const APP_DB_URL = process.env.APP_DATABASE_URL;

const ARTISAN_ID = 9940001;
const CLIENT_ID = 8880001;
const FACTURE_ID = 7780001;
const FACTURE_ID_2 = 7780002;

describe.skipIf(!DB_URL)("compta-reconciler — L2", () => {
  let handle: DbHandle;
  let ownerDb: DbClient;
  let admin: Pool;

  const cleanAll = async () => {
    await admin.query(
      `DELETE FROM ecritures_comptables WHERE "artisanId" = $1`,
      [ARTISAN_ID],
    );
    await admin.query(
      `DELETE FROM event_outbox WHERE "artisanId" = $1`,
      [ARTISAN_ID],
    );
    await admin.query(
      `DELETE FROM factures WHERE "artisanId" = $1`,
      [ARTISAN_ID],
    );
  };

  const insertFacture = async (
    id: number,
    statut: string,
    totalTTC = "1000.00",
    totalHT = "833.33",
    totalTVA = "166.67",
    datePaiement?: string,
  ) => {
    await admin.query(
      `INSERT INTO factures (id, "artisanId", "clientId", statut, "typeDocument", "totalTTC", "totalHT", "totalTVA", "dateFacture", "datePaiement", numero, "updatedAt", "createdAt")
       VALUES ($1, $2, $3, $4::facture_statut, 'facture', $5, $6, $7, NOW() - INTERVAL '10 minutes', $8, $9, NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '10 minutes')
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        ARTISAN_ID,
        CLIENT_ID,
        statut,
        totalTTC,
        totalHT,
        totalTVA,
        datePaiement ?? null,
        `FAC-TEST-${id}`,
      ],
    );
  };

  beforeAll(async () => {
    admin = new Pool({ connectionString: DB_URL });
    handle = createDbClient(DB_URL!);
    ownerDb = handle.db;
    await cleanAll();
  });

  afterAll(async () => {
    await cleanAll();
    await handle.close();
    await admin.end();
  });

  beforeEach(() => cleanAll());
  afterEach(() => cleanAll());

  it("I1 : facture envoyée sans écriture → VE générée atomiquement + healing event", async () => {
    await insertFacture(FACTURE_ID, "envoyee");

    await runComptaReconciler(ownerDb, { dryRun: false });

    const ecritures = await admin.query(
      `SELECT journal, debit, credit FROM ecritures_comptables WHERE "artisanId" = $1 AND "factureId" = $2 ORDER BY id`,
      [ARTISAN_ID, FACTURE_ID],
    );
    expect(ecritures.rows.length).toBeGreaterThanOrEqual(2);
    const journals = ecritures.rows.map((r: { journal: string }) => r.journal);
    expect(journals).toContain("VE");
    expect(journals.every((j: string) => j === "VE")).toBe(true);

    /** Σdébit = Σcrédit (équilibre de la pièce) */
    const totalDebit = ecritures.rows.reduce(
      (s: number, r: { debit: string }) => s + Number(r.debit),
      0,
    );
    const totalCredit = ecritures.rows.reduce(
      (s: number, r: { credit: string }) => s + Number(r.credit),
      0,
    );
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.02);

    const healingEvents = await admin.query(
      `SELECT payload FROM event_outbox WHERE "artisanId" = $1 AND action = 'healing.compta.ve-manquante'`,
      [ARTISAN_ID],
    );
    expect(healingEvents.rows).toHaveLength(1);
    expect(healingEvents.rows[0].payload).toMatchObject({
      dryRun: false,
      invariant: "ve-manquante",
    });
  });

  it("I1 : facture payée → VE + BQ générées", async () => {
    await insertFacture(FACTURE_ID, "payee", "1200.00", "1000.00", "200.00", "2026-06-01");

    await runComptaReconciler(ownerDb, { dryRun: false });

    const ecritures = await admin.query(
      `SELECT journal FROM ecritures_comptables WHERE "artisanId" = $1 AND "factureId" = $2`,
      [ARTISAN_ID, FACTURE_ID],
    );
    const journals = ecritures.rows.map((r: { journal: string }) => r.journal);
    expect(journals).toContain("VE");
    expect(journals).toContain("BQ");
  });

  it("I1 : idempotent — 2ème run ne génère plus rien", async () => {
    await insertFacture(FACTURE_ID, "envoyee");

    await runComptaReconciler(ownerDb, { dryRun: false });
    await admin.query(`DELETE FROM event_outbox WHERE "artisanId" = $1`, [ARTISAN_ID]);
    await runComptaReconciler(ownerDb, { dryRun: false });

    const ecritures = await admin.query(
      `SELECT id FROM ecritures_comptables WHERE "artisanId" = $1 AND "factureId" = $2`,
      [ARTISAN_ID, FACTURE_ID],
    );
    expect(ecritures.rows.length).toBeGreaterThanOrEqual(2);

    const healingEvents = await admin.query(
      `SELECT 1 FROM event_outbox WHERE "artisanId" = $1 AND action = 'healing.compta.ve-manquante'`,
      [ARTISAN_ID],
    );
    /** 2ème run = plus de gap détecté, pas de nouvel event */
    expect(healingEvents.rows).toHaveLength(0);
  });

  it("dry-run : aucune écriture créée, healing event dryRun:true", async () => {
    await insertFacture(FACTURE_ID, "envoyee");

    await runComptaReconciler(ownerDb, { dryRun: true });

    const ecritures = await admin.query(
      `SELECT 1 FROM ecritures_comptables WHERE "artisanId" = $1 AND "factureId" = $2`,
      [ARTISAN_ID, FACTURE_ID],
    );
    expect(ecritures.rows).toHaveLength(0);

    const healingEvents = await admin.query(
      `SELECT payload FROM event_outbox WHERE "artisanId" = $1 AND action = 'healing.compta.ve-manquante'`,
      [ARTISAN_ID],
    );
    expect(healingEvents.rows).toHaveLength(1);
    expect(healingEvents.rows[0].payload).toMatchObject({ dryRun: true, invariant: "ve-manquante" });
  });

  it("circuit-breaker : > seuil → onSeuilDepasse, aucune écriture créée", async () => {
    for (const id of [FACTURE_ID, FACTURE_ID_2, 7780003, 7780004]) {
      await insertFacture(id, "envoyee");
    }

    let seuilAnomalies: ReadonlyArray<Anomalie> | null = null;
    await runComptaReconciler(ownerDb, {
      dryRun: false,
      seuil: 3,
      onSeuilDepasse: async (a) => {
        seuilAnomalies = a;
      },
    });

    const ecritures = await admin.query(
      `SELECT 1 FROM ecritures_comptables WHERE "artisanId" = $1`,
      [ARTISAN_ID],
    );
    expect(ecritures.rows).toHaveLength(0);
    expect(seuilAnomalies).not.toBeNull();
    expect((seuilAnomalies as ReadonlyArray<Anomalie>).length).toBe(4);
  });

  it("facture avec écritures validées ignorée (guard validate)", async () => {
    await insertFacture(FACTURE_ID, "envoyee");
    /** Insérer une écriture validée → ne doit PAS être retouchée */
    await admin.query(
      `INSERT INTO ecritures_comptables ("artisanId", "dateEcriture", journal, "numeroCompte", libelle, debit, credit, "factureId", statut)
       VALUES ($1, NOW(), 'VE', '411000', 'Facture test', 1000.00, 0, $2, 'validee')`,
      [ARTISAN_ID, FACTURE_ID],
    );

    await runComptaReconciler(ownerDb, { dryRun: false });

    /** Doit rester à 1 ligne (celle qu'on a insérée manuellement) */
    const ecritures = await admin.query(
      `SELECT id FROM ecritures_comptables WHERE "artisanId" = $1 AND "factureId" = $2`,
      [ARTISAN_ID, FACTURE_ID],
    );
    expect(ecritures.rows).toHaveLength(1);
  });

  it("rls-guard : app_tenant sans SET app.tenant voit 0 factures (prouve ownerDb obligatoire)", async () => {
    if (!APP_DB_URL) return;

    await insertFacture(FACTURE_ID, "envoyee");

    const appPool = new Pool({ connectionString: APP_DB_URL });
    try {
      const result = await appPool.query(
        `SELECT id FROM factures WHERE "artisanId" = $1 AND statut = 'envoyee'`,
        [ARTISAN_ID],
      );
      /** RLS-FORCE : sans SET app.tenant, app_tenant ne voit rien → detect() retourne [] */
      expect(result.rows).toHaveLength(0);
    } finally {
      await appPool.end();
    }
  });

  it("I-revue-bq : BQ sans VE → revue-requise event (pas d'auto-fix)", async () => {
    await insertFacture(FACTURE_ID, "payee");
    /** Insérer une BQ mais pas de VE — état partial ambigu */
    await admin.query(
      `INSERT INTO ecritures_comptables ("artisanId", "dateEcriture", journal, "numeroCompte", libelle, debit, credit, "factureId", statut)
       VALUES ($1, NOW(), 'BQ', '512000', 'Règlement test', 1000.00, 0, $2, 'brouillon')`,
      [ARTISAN_ID, FACTURE_ID],
    );

    await runComptaReconciler(ownerDb, { dryRun: false });

    /** Aucune nouvelle écriture VE créée */
    const ecrituresVE = await admin.query(
      `SELECT 1 FROM ecritures_comptables WHERE "artisanId" = $1 AND "factureId" = $2 AND journal = 'VE'`,
      [ARTISAN_ID, FACTURE_ID],
    );
    expect(ecrituresVE.rows).toHaveLength(0);

    /** Event revue-requise bq-sans-ve émis */
    const revueEvents = await admin.query(
      `SELECT payload FROM event_outbox WHERE "artisanId" = $1 AND action = 'healing.compta.revue-requise' AND payload->>'invariant' = 'bq-sans-ve'`,
      [ARTISAN_ID],
    );
    expect(revueEvents.rows).toHaveLength(1);
    expect(revueEvents.rows[0].payload).toMatchObject({ invariant: "bq-sans-ve" });
  });
});

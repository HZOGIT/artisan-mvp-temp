import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import type { DbClient, DbHandle } from "../../../shared/db";
import { runEmailsLogReconciler } from "./emails-log-reconciler";
import type { Anomalie } from "../../../platform/scheduler/reconciler";

const APP_DB_URL = process.env.APP_DATABASE_URL;

const DB_URL = process.env.DATABASE_URL;
const ARTISAN_ID = 9939001;
const FACTURE_ID = 7770001;
const DEVIS_ID = 7770002;

describe.skipIf(!DB_URL)("emails-log reconciler — L2", () => {
  let handle: DbHandle;
  let db: DbClient;
  let admin: Pool;

  const cleanAll = () =>
    Promise.all([
      admin.query(
        `DELETE FROM events WHERE "artisanId" = $1 AND action IN ('facture.email_envoye', 'devis.email_envoye')`,
        [ARTISAN_ID],
      ),
      admin.query(`DELETE FROM emails_log WHERE "artisanId" = $1`, [ARTISAN_ID]),
      admin.query(`DELETE FROM event_outbox WHERE "artisanId" = $1`, [ARTISAN_ID]),
    ]);

  beforeAll(async () => {
    admin = new Pool({ connectionString: DB_URL });
    handle = createDbClient(DB_URL!);
    db = handle.db;
    await cleanAll();
  });

  afterAll(async () => {
    await cleanAll();
    await handle.close();
    await admin.end();
  });

  beforeEach(() => cleanAll());
  afterEach(() => cleanAll());

  it("envoi sans emails_log → backfillé 1x atomiquement (heal + healing event dans même tx)", async () => {
    await admin.query(
      `INSERT INTO events ("artisanId", "entityType", "entityId", action, "createdAt")
       VALUES ($1, 'facture', $2, 'facture.email_envoye', NOW() - INTERVAL '10 minutes')`,
      [ARTISAN_ID, FACTURE_ID],
    );

    await runEmailsLogReconciler(db, { dryRun: false });

    const logRows = await admin.query(
      `SELECT * FROM emails_log WHERE "artisanId" = $1 AND "entiteType" = 'facture' AND "entiteId" = $2`,
      [ARTISAN_ID, FACTURE_ID],
    );
    expect(logRows.rows).toHaveLength(1);
    expect(logRows.rows[0].statut).toBe("inconnu");
    expect(logRows.rows[0].type).toBe("envoi_facture");

    const outboxRows = await admin.query(
      `SELECT payload FROM event_outbox WHERE "artisanId" = $1 AND action = 'healing.emails.log-manquant'`,
      [ARTISAN_ID],
    );
    expect(outboxRows.rows).toHaveLength(1);
    expect(outboxRows.rows[0].payload).toMatchObject({ dryRun: false, invariant: "log-manquant" });
  });

  it("idempotent — 2ème run ne détecte plus de gap", async () => {
    await admin.query(
      `INSERT INTO events ("artisanId", "entityType", "entityId", action, "createdAt")
       VALUES ($1, 'facture', $2, 'facture.email_envoye', NOW() - INTERVAL '10 minutes')`,
      [ARTISAN_ID, FACTURE_ID],
    );

    await runEmailsLogReconciler(db, { dryRun: false });
    await admin.query(`DELETE FROM event_outbox WHERE "artisanId" = $1`, [ARTISAN_ID]);
    await runEmailsLogReconciler(db, { dryRun: false });

    const logRows = await admin.query(
      `SELECT * FROM emails_log WHERE "artisanId" = $1 AND "entiteType" = 'facture' AND "entiteId" = $2`,
      [ARTISAN_ID, FACTURE_ID],
    );
    expect(logRows.rows).toHaveLength(1);

    const outboxRows = await admin.query(
      `SELECT 1 FROM event_outbox WHERE "artisanId" = $1 AND action = 'healing.emails.log-manquant'`,
      [ARTISAN_ID],
    );
    expect(outboxRows.rows).toHaveLength(0);
  });

  it("dry-run = true — emails_log non modifié, healing event dryRun:true dans outbox", async () => {
    await admin.query(
      `INSERT INTO events ("artisanId", "entityType", "entityId", action, "createdAt")
       VALUES ($1, 'devis', $2, 'devis.email_envoye', NOW() - INTERVAL '10 minutes')`,
      [ARTISAN_ID, DEVIS_ID],
    );

    await runEmailsLogReconciler(db, { dryRun: true });

    const logRows = await admin.query(
      `SELECT 1 FROM emails_log WHERE "artisanId" = $1 AND "entiteId" = $2`,
      [ARTISAN_ID, DEVIS_ID],
    );
    expect(logRows.rows).toHaveLength(0);

    const outboxRows = await admin.query(
      `SELECT payload FROM event_outbox WHERE "artisanId" = $1 AND action = 'healing.emails.log-manquant'`,
      [ARTISAN_ID],
    );
    expect(outboxRows.rows).toHaveLength(1);
    expect(outboxRows.rows[0].payload).toMatchObject({ dryRun: true, invariant: "log-manquant" });
  });

  it("rls-guard: app_tenant voit 0 emails_log sans app.tenant (démontre le besoin d'ownerDb)", async () => {
    if (!APP_DB_URL) return;
    await admin.query(
      `INSERT INTO emails_log ("artisanId", destinataire, sujet, type, statut, "entiteType", "entiteId")
       VALUES ($1, 'x@x.com', 'Test', 'envoi_facture', 'sent', 'facture', $2)`,
      [ARTISAN_ID, FACTURE_ID],
    );
    const appPool = new Pool({ connectionString: APP_DB_URL });
    try {
      const result = await appPool.query(
        `SELECT id FROM emails_log WHERE "artisanId" = $1`,
        [ARTISAN_ID],
      );
      expect(result.rows).toHaveLength(0);
    } finally {
      await appPool.end();
    }
  });

  it("seuil dépassé → onSeuilDepasse appelé, rien réparé", async () => {
    const ids = [7770010, 7770011, 7770012, 7770013];
    for (const id of ids) {
      await admin.query(
        `INSERT INTO events ("artisanId", "entityType", "entityId", action, "createdAt")
         VALUES ($1, 'facture', $2, 'facture.email_envoye', NOW() - INTERVAL '10 minutes')`,
        [ARTISAN_ID, id],
      );
    }

    let seuilAnomalies: ReadonlyArray<Anomalie> | null = null;
    await runEmailsLogReconciler(db, {
      dryRun: false,
      seuil: 3,
      onSeuilDepasse: async (a) => { seuilAnomalies = a; },
    });

    const logRows = await admin.query(
      `SELECT 1 FROM emails_log WHERE "artisanId" = $1`,
      [ARTISAN_ID],
    );
    expect(logRows.rows).toHaveLength(0);
    expect(seuilAnomalies).not.toBeNull();
    expect(seuilAnomalies!.length).toBe(4);
  });
});

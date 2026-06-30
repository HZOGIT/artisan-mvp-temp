import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import type { DbHandle, DbClient } from "../../../shared/db";
import { createOutboxBloqueJob } from "./events-healing";
import { createEventManquantNotificationJob } from "./events-healing";

const DB_URL = process.env.DATABASE_URL;

const TEST_ARTISAN_ID = 1;
const NOTIF_BASE_ID = 9_800_000;

describe.skipIf(!DB_URL)("createOutboxBloqueJob — L2", () => {
  let handle: DbHandle;
  let db: DbClient;
  let admin: Pool;

  beforeAll(async () => {
    admin = new Pool({ connectionString: DB_URL });
    handle = createDbClient(DB_URL!);
    db = handle.db;
    await admin.query(
      `DELETE FROM event_outbox WHERE "entityType" = 'heal-l2-outbox-test'`,
    );
    await admin.query(
      `DELETE FROM events WHERE "entityType" = 'heal-l2-outbox-test'`,
    );
    await admin.query(
      `DELETE FROM event_outbox WHERE action IN ('healing.events.outbox-bloque', 'healing.events.outbox-bloque-dryrun')`,
    );
  });

  afterAll(async () => {
    await admin.query(
      `DELETE FROM event_outbox WHERE "entityType" = 'heal-l2-outbox-test'`,
    );
    await admin.query(
      `DELETE FROM events WHERE "entityType" = 'heal-l2-outbox-test'`,
    );
    await admin.query(
      `DELETE FROM event_outbox WHERE action IN ('healing.events.outbox-bloque', 'healing.events.outbox-bloque-dryrun')`,
    );
    await admin.end();
    await handle.close();
  });

  it("outbox bloquée → drainée dans event_log + healing event dans outbox (atomique)", async () => {
    const { rows: inserted } = await admin.query<{ id: number }>(
      `INSERT INTO event_outbox ("artisanId", "entityType", "entityId", action, "createdAt")
       VALUES ($1, 'heal-l2-outbox-test', 1, 'test.bloque', NOW() - INTERVAL '60 minutes')
       RETURNING id`,
      [TEST_ARTISAN_ID],
    );
    const outboxId = inserted[0]!.id;

    const job = createOutboxBloqueJob({
      db,
      seuilAgeMinutes: 30,
      seuil: 50,
      dryRun: false,
    });
    await job.run();

    const { rows: inOutbox } = await admin.query(
      `SELECT 1 FROM event_outbox WHERE id = $1`,
      [outboxId],
    );
    expect(inOutbox).toHaveLength(0);

    const { rows: inLog } = await admin.query<{ action: string }>(
      `SELECT action FROM events WHERE "entityType" = 'heal-l2-outbox-test' AND "entityId" = 1 AND action = 'test.bloque'`,
    );
    expect(inLog).toHaveLength(1);

    const { rows: healingEvents } = await admin.query(
      `SELECT 1 FROM event_outbox WHERE action = 'healing.events.outbox-bloque'`,
    );
    expect(healingEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("dry-run : healing event dryRun:true émis, outbox non drainée", async () => {
    const { rows: inserted } = await admin.query<{ id: number }>(
      `INSERT INTO event_outbox ("artisanId", "entityType", "entityId", action, "createdAt")
       VALUES ($1, 'heal-l2-outbox-test', 2, 'test.bloque-dry', NOW() - INTERVAL '60 minutes')
       RETURNING id`,
      [TEST_ARTISAN_ID],
    );
    const outboxId = inserted[0]!.id;

    await admin.query(`DELETE FROM event_outbox WHERE action = 'healing.events.outbox-bloque'`);

    const job = createOutboxBloqueJob({ db, seuilAgeMinutes: 30, dryRun: true });
    await job.run();

    const { rows: inOutbox } = await admin.query(
      `SELECT 1 FROM event_outbox WHERE id = $1`,
      [outboxId],
    );
    expect(inOutbox).toHaveLength(1);

    const { rows: healingEvents } = await admin.query<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM event_outbox WHERE action = 'healing.events.outbox-bloque'`,
    );
    expect(healingEvents.length).toBeGreaterThanOrEqual(1);
    expect(healingEvents[0]?.payload).toMatchObject({ dryRun: true });

    await admin.query(`DELETE FROM event_outbox WHERE id = $1`, [outboxId]);
  });

  it("seuil dépassé → aucune réparation, onSeuilDepasse appelé", async () => {
    await admin.query(
      `INSERT INTO event_outbox ("artisanId", "entityType", "entityId", action, "createdAt")
       SELECT $1, 'heal-l2-outbox-test', generate_series(10, 14), 'test.seuil', NOW() - INTERVAL '60 minutes'`,
      [TEST_ARTISAN_ID],
    );

    let seuilAnomalies: ReadonlyArray<{ entityId: number }> | null = null;
    const job = createOutboxBloqueJob({
      db,
      seuilAgeMinutes: 30,
      seuil: 3,
      dryRun: false,
      onSeuilDepasse: async (a) => { seuilAnomalies = a as ReadonlyArray<{ entityId: number }>; },
    });
    await job.run();

    expect(seuilAnomalies).not.toBeNull();
    expect((seuilAnomalies as unknown[]).length).toBeGreaterThan(3);

    const { rows: remaining } = await admin.query(
      `SELECT 1 FROM event_outbox WHERE "entityType" = 'heal-l2-outbox-test' AND action = 'test.seuil'`,
    );
    expect(remaining.length).toBeGreaterThan(0);

    await admin.query(
      `DELETE FROM event_outbox WHERE "entityType" = 'heal-l2-outbox-test' AND action = 'test.seuil'`,
    );
  });
});

describe.skipIf(!DB_URL)("createEventManquantNotificationJob — L2", () => {
  let handle: DbHandle;
  let db: DbClient;
  let admin: Pool;

  const cleanupNotif = () =>
    admin.query(`DELETE FROM notifications WHERE id >= $1 AND id < $2`, [NOTIF_BASE_ID, NOTIF_BASE_ID + 100]);
  const cleanupEvents = () =>
    admin.query(
      `DELETE FROM event_outbox WHERE action IN ('notification.lue', 'healing.events.notification-manquant') AND "entityId" >= $1 AND "entityId" < $2`,
      [NOTIF_BASE_ID, NOTIF_BASE_ID + 100],
    );
  const cleanupLog = () =>
    admin.query(
      `DELETE FROM events WHERE action = 'notification.lue' AND "entityId" >= $1 AND "entityId" < $2`,
      [NOTIF_BASE_ID, NOTIF_BASE_ID + 100],
    );

  beforeAll(async () => {
    admin = new Pool({ connectionString: DB_URL });
    handle = createDbClient(DB_URL!);
    db = handle.db;
    await cleanupNotif();
    await cleanupEvents();
    await cleanupLog();
  });

  afterAll(async () => {
    await cleanupNotif();
    await cleanupEvents();
    await cleanupLog();
    await admin.end();
    await handle.close();
  });

  it("notification.lue sans event → event émis dans outbox + healing event (atomique)", async () => {
    const notifId = NOTIF_BASE_ID + 1;
    await admin.query(
      `INSERT INTO notifications (id, "artisanId", titre, lu, "createdAt")
       VALUES ($1, $2, 'test-heal', true, NOW() - INTERVAL '10 minutes')
       ON CONFLICT (id) DO NOTHING`,
      [notifId, TEST_ARTISAN_ID],
    );

    const job = createEventManquantNotificationJob({
      db,
      ownerDb: db,
      seuil: 50,
      dryRun: false,
    });
    await job.run();

    const { rows: emitted } = await admin.query(
      `SELECT action FROM event_outbox WHERE "entityType" = 'notification' AND "entityId" = $1 AND action = 'notification.lue'`,
      [notifId],
    );
    expect(emitted).toHaveLength(1);

    const { rows: healingEvents } = await admin.query(
      `SELECT payload FROM event_outbox WHERE action = 'healing.events.notification-manquant' AND "entityId" = $1`,
      [notifId],
    );
    expect(healingEvents).toHaveLength(1);
    expect(healingEvents[0]?.payload).toMatchObject({ dryRun: false });
  });

  it("notification.lue avec event déjà dans event_log → non détectée", async () => {
    const notifId = NOTIF_BASE_ID + 2;
    await admin.query(
      `INSERT INTO notifications (id, "artisanId", titre, lu, "createdAt")
       VALUES ($1, $2, 'test-heal-existing', true, NOW() - INTERVAL '10 minutes')
       ON CONFLICT (id) DO NOTHING`,
      [notifId, TEST_ARTISAN_ID],
    );
    await admin.query(
      `INSERT INTO events ("artisanId", "entityType", "entityId", action)
       VALUES ($1, 'notification', $2, 'notification.lue')`,
      [TEST_ARTISAN_ID, notifId],
    );

    await admin.query(`DELETE FROM event_outbox WHERE action = 'healing.events.notification-manquant' AND "entityId" = $1`, [notifId]);

    const job = createEventManquantNotificationJob({ db, ownerDb: db, dryRun: false });
    await job.run();

    const { rows } = await admin.query(
      `SELECT 1 FROM event_outbox WHERE action = 'healing.events.notification-manquant' AND "entityId" = $1`,
      [notifId],
    );
    expect(rows).toHaveLength(0);
  });

  it("notification non-lue → non détectée", async () => {
    const notifId = NOTIF_BASE_ID + 3;
    await admin.query(
      `INSERT INTO notifications (id, "artisanId", titre, lu, "createdAt")
       VALUES ($1, $2, 'test-heal-not-read', false, NOW() - INTERVAL '10 minutes')
       ON CONFLICT (id) DO NOTHING`,
      [notifId, TEST_ARTISAN_ID],
    );

    const job = createEventManquantNotificationJob({ db, ownerDb: db, dryRun: false });
    await job.run();

    const { rows } = await admin.query(
      `SELECT 1 FROM event_outbox WHERE action IN ('notification.lue', 'healing.events.notification-manquant') AND "entityId" = $1`,
      [notifId],
    );
    expect(rows).toHaveLength(0);
  });

  it("notification.lue antérieure au cutoff OPE-952 → exclue du détecteur (backlog historique)", async () => {
    const notifId = NOTIF_BASE_ID + 5;
    await admin.query(
      `INSERT INTO notifications (id, "artisanId", titre, lu, "createdAt")
       VALUES ($1, $2, 'test-heal-backlog', true, '2026-06-01T00:00:00Z')
       ON CONFLICT (id) DO NOTHING`,
      [notifId, TEST_ARTISAN_ID],
    );

    const job = createEventManquantNotificationJob({ db, ownerDb: db, dryRun: false });
    await job.run();

    const { rows } = await admin.query(
      `SELECT 1 FROM event_outbox WHERE action IN ('notification.lue', 'healing.events.notification-manquant') AND "entityId" = $1`,
      [notifId],
    );
    expect(rows).toHaveLength(0);

    await admin.query(`DELETE FROM notifications WHERE id = $1`, [notifId]);
  });

  it("dry-run : healing event dryRun:true, aucun event notification.lue émis", async () => {
    const notifId = NOTIF_BASE_ID + 4;
    await admin.query(
      `INSERT INTO notifications (id, "artisanId", titre, lu, "createdAt")
       VALUES ($1, $2, 'test-heal-dryrun', true, NOW() - INTERVAL '10 minutes')
       ON CONFLICT (id) DO NOTHING`,
      [notifId, TEST_ARTISAN_ID],
    );

    const job = createEventManquantNotificationJob({ db, ownerDb: db, dryRun: true });
    await job.run();

    const { rows: emitted } = await admin.query(
      `SELECT 1 FROM event_outbox WHERE "entityType" = 'notification' AND "entityId" = $1 AND action = 'notification.lue'`,
      [notifId],
    );
    expect(emitted).toHaveLength(0);

    const { rows: healingDry } = await admin.query<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM event_outbox WHERE action = 'healing.events.notification-manquant' AND "entityId" = $1`,
      [notifId],
    );
    expect(healingDry.length).toBeGreaterThanOrEqual(1);
    expect(healingDry[0]?.payload).toMatchObject({ dryRun: true });
  });
});

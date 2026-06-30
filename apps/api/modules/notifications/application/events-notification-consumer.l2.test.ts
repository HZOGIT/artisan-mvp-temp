import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import type { DbHandle, DbClient } from "../../../shared/db";
import { creerNotificationsDepuisEvents } from "./events-notification-consumer";

const DB_URL = process.env.DATABASE_URL;

const TEST_ARTISAN_ID = 9_910_000;
const BASE_ENTITY_ID = 9_910_000;

describe.skipIf(!DB_URL)("creerNotificationsDepuisEvents — L2", () => {
  let handle: DbHandle;
  let db: DbClient;
  let admin: Pool;

  const cleanup = () =>
    Promise.all([
      admin.query(`DELETE FROM notifications WHERE "artisanId" = $1 AND lien LIKE '%ev=%'`, [TEST_ARTISAN_ID]),
      admin.query(`DELETE FROM events WHERE "artisanId" = $1 AND "entityId" >= $2`, [TEST_ARTISAN_ID, BASE_ENTITY_ID]),
    ]);

  beforeAll(async () => {
    admin = new Pool({ connectionString: DB_URL });
    handle = createDbClient(DB_URL!);
    db = handle.db;
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await admin.end();
    await handle.close();
  });

  it("devis.envoye dans event_log → notification créée", async () => {
    const { rows: [ev] } = await admin.query<{ id: number }>(
      `INSERT INTO events ("artisanId", "entityType", "entityId", action, payload)
       VALUES ($1, 'devis', $2, 'devis.envoye', '{"numero": "DV-001", "totalTTC": "1500.00"}')
       RETURNING id`,
      [TEST_ARTISAN_ID, BASE_ENTITY_ID + 1],
    );
    const eventId = ev!.id;

    const { created } = await creerNotificationsDepuisEvents(db);

    expect(created).toBeGreaterThanOrEqual(1);

    const { rows } = await admin.query<{ titre: string; lien: string; type: string }>(
      `SELECT titre, lien, type FROM notifications WHERE "artisanId" = $1 AND lien = $2`,
      [TEST_ARTISAN_ID, `/devis/${BASE_ENTITY_ID + 1}?ev=${eventId}`],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.titre).toBe("Devis envoyé au client");
    expect(rows[0]!.type).toBe("info");
  });

  it("abonnement.plan_change → notification créée", async () => {
    const { rows: [ev] } = await admin.query<{ id: number }>(
      `INSERT INTO events ("artisanId", "entityType", "entityId", action, payload)
       VALUES ($1, 'abonnement', $2, 'abonnement.plan_change', '{"from": "starter", "to": "pro"}')
       RETURNING id`,
      [TEST_ARTISAN_ID, BASE_ENTITY_ID + 2],
    );
    const eventId = ev!.id;

    const { created } = await creerNotificationsDepuisEvents(db);

    expect(created).toBeGreaterThanOrEqual(1);

    const { rows } = await admin.query<{ titre: string; lien: string }>(
      `SELECT titre, lien FROM notifications WHERE "artisanId" = $1 AND lien LIKE '%ev=' || $2::text`,
      [TEST_ARTISAN_ID, eventId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.titre).toBe("Changement de plan");
    expect(rows[0]!.lien).toBe(`/parametres?tab=abonnement&ev=${eventId}`);
  });

  it("idempotence — rejouer ne crée pas de doublon", async () => {
    const { rows: existing } = await admin.query<{ id: number }>(
      `SELECT id FROM events WHERE "artisanId" = $1 AND action = 'devis.envoye' AND "entityId" = $2`,
      [TEST_ARTISAN_ID, BASE_ENTITY_ID + 1],
    );
    expect(existing.length).toBeGreaterThanOrEqual(1);

    const before = await admin.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM notifications WHERE "artisanId" = $1 AND lien LIKE '%devis%ev=%'`,
      [TEST_ARTISAN_ID],
    );

    await creerNotificationsDepuisEvents(db);

    const after = await admin.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM notifications WHERE "artisanId" = $1 AND lien LIKE '%devis%ev=%'`,
      [TEST_ARTISAN_ID],
    );
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  });

  it("event exclu (devis.cree) → aucune notification créée", async () => {
    await admin.query(
      `INSERT INTO events ("artisanId", "entityType", "entityId", action, payload)
       VALUES ($1, 'devis', $2, 'devis.cree', '{"numero": "DV-002"}')`,
      [TEST_ARTISAN_ID, BASE_ENTITY_ID + 3],
    );

    const before = await admin.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM notifications WHERE "artisanId" = $1 AND titre = 'Devis créé'`,
      [TEST_ARTISAN_ID],
    );
    await creerNotificationsDepuisEvents(db);
    const after = await admin.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM notifications WHERE "artisanId" = $1 AND titre = 'Devis créé'`,
      [TEST_ARTISAN_ID],
    );
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  });
});

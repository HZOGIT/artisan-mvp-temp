import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../db";
import { runRetentionPurge } from "./retention-purge-cron";

const OWNER_URL = process.env.DATABASE_URL;
const APP_URL = process.env.APP_DATABASE_URL;

const ARTISAN_ID = 9_981_002;
const USER_ID = 9_981_002;

describe.skipIf(!OWNER_URL)("runRetentionPurge — anti-régression RGPD Art. 5(1)(e) (PG)", () => {
  const admin = new Pool({ connectionString: OWNER_URL });
  const { db: ownerDb, close: closeOwner } = createDbClient(OWNER_URL!);

  const cleanup = async () => {
    await admin.query(`DELETE FROM demandes_contact WHERE "artisanId" = $1`, [ARTISAN_ID]);
    await admin.query(`DELETE FROM email_outbox WHERE to_email = 'purge-test@example.com'`);
    await admin.query(`DELETE FROM devices WHERE artisan_id = $1`, [ARTISAN_ID]);
  };

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await closeOwner();
    await admin.end();
  });

  it("supprime les prospects non convertis expirés (> 3 ans) via rôle owner (RLS bypass)", async () => {
    const oldDate = new Date(Date.now() - 4 * 365 * 24 * 3600 * 1000);
    const recentDate = new Date(Date.now() - 30 * 24 * 3600 * 1000);

    await admin.query(
      `INSERT INTO demandes_contact ("artisanId", nom, email, statut, "createdAt", "updatedAt")
       VALUES ($1, 'Vieux Prospect', 'old@example.com', 'perdu', $2, $2)`,
      [ARTISAN_ID, oldDate],
    );
    await admin.query(
      `INSERT INTO demandes_contact ("artisanId", nom, email, statut, "createdAt", "updatedAt")
       VALUES ($1, 'Prospect Récent', 'new@example.com', 'perdu', $2, $2)`,
      [ARTISAN_ID, recentDate],
    );
    await admin.query(
      `INSERT INTO demandes_contact ("artisanId", nom, email, statut, "createdAt", "updatedAt")
       VALUES ($1, 'Converti Ancien', 'conv@example.com', 'converti', $2, $2)`,
      [ARTISAN_ID, oldDate],
    );

    await runRetentionPurge(ownerDb);

    const { rows } = await admin.query(
      `SELECT nom FROM demandes_contact WHERE "artisanId" = $1 ORDER BY nom`,
      [ARTISAN_ID],
    );
    const noms = rows.map((r: { nom: string }) => r.nom);
    expect(noms).not.toContain("Vieux Prospect");
    expect(noms).toContain("Prospect Récent");
    expect(noms).toContain("Converti Ancien");
  });

  it("anonymise le HTML des emails outbox envoyés (> 30j) et conserve les récents", async () => {
    const old = new Date(Date.now() - 60 * 24 * 3600 * 1000);
    const recent = new Date(Date.now() - 5 * 24 * 3600 * 1000);

    await admin.query(
      `INSERT INTO email_outbox (to_email, subject, html, statut, traitee_at, created_at)
       VALUES ('purge-test@example.com', 'Old', '<p>PII ancienne</p>', 'sent', $1, $1)`,
      [old],
    );
    await admin.query(
      `INSERT INTO email_outbox (to_email, subject, html, statut, traitee_at, created_at)
       VALUES ('purge-test@example.com', 'Recent', '<p>PII récente</p>', 'sent', $1, $1)`,
      [recent],
    );

    await runRetentionPurge(ownerDb);

    const { rows } = await admin.query(
      `SELECT subject, html FROM email_outbox WHERE to_email = 'purge-test@example.com' ORDER BY subject`,
    );
    const old_row = rows.find((r: { subject: string }) => r.subject === "Old");
    const recent_row = rows.find((r: { subject: string }) => r.subject === "Recent");
    expect(old_row?.html).toBe("");
    expect(recent_row?.html).toBe("<p>PII récente</p>");
  });

  it("supprime les devices inactifs (> 90j) et conserve les actifs", async () => {
    const oldActivity = new Date(Date.now() - 120 * 24 * 3600 * 1000);
    const recentActivity = new Date(Date.now() - 10 * 24 * 3600 * 1000);

    await admin.query(
      `INSERT INTO devices (user_id, artisan_id, device_fingerprint, last_active_at, created_at)
       VALUES ($1, $2, 'fp-old-test', $3, $3)`,
      [USER_ID, ARTISAN_ID, oldActivity],
    );
    await admin.query(
      `INSERT INTO devices (user_id, artisan_id, device_fingerprint, last_active_at, created_at)
       VALUES ($1, $2, 'fp-recent-test', $3, $3)`,
      [USER_ID, ARTISAN_ID, recentActivity],
    );

    await runRetentionPurge(ownerDb);

    const { rows } = await admin.query(
      `SELECT device_fingerprint FROM devices WHERE artisan_id = $1`,
      [ARTISAN_ID],
    );
    const fps = rows.map((r: { device_fingerprint: string }) => r.device_fingerprint);
    expect(fps).not.toContain("fp-old-test");
    expect(fps).toContain("fp-recent-test");
  });

  it("est idempotent — deuxième run sans erreur ni suppression excessive", async () => {
    await expect(runRetentionPurge(ownerDb)).resolves.toBeUndefined();
  });

  it.skipIf(!APP_URL)("app_tenant sans contexte tenant : ne purge PAS les tables RLS (anti-régression false-green)", async () => {
    const oldDate = new Date(Date.now() - 4 * 365 * 24 * 3600 * 1000);
    await admin.query(
      `INSERT INTO demandes_contact ("artisanId", nom, email, statut, "createdAt", "updatedAt")
       VALUES ($1, 'RLS Test Prospect', 'rls@example.com', 'perdu', $2, $2)`,
      [ARTISAN_ID, oldDate],
    );

    const { db: appTenantDb, close: closeApp } = createDbClient(APP_URL!);
    try {
      await runRetentionPurge(appTenantDb);
    } finally {
      await closeApp();
    }

    const { rows } = await admin.query(
      `SELECT nom FROM demandes_contact WHERE "artisanId" = $1 AND nom = 'RLS Test Prospect'`,
      [ARTISAN_ID],
    );
    expect(rows).toHaveLength(1);
    await admin.query(`DELETE FROM demandes_contact WHERE "artisanId" = $1 AND nom = 'RLS Test Prospect'`, [ARTISAN_ID]);
  });
});

import { describe, it, expect, afterAll } from "vitest";
import { Pool } from "pg";

/**
 * Vérifie que paiements_stripe est FORCE ROW LEVEL SECURITY :
 * - app_tenant sans SET app.tenant voit 0 lignes (le poller cassait avant le fix)
 * - artisan_user (owner) voit les lignes → dbUrl doit pointer vers DATABASE_URL
 */
const OWNER_URL = process.env.DATABASE_URL;
const APP_URL = process.env.APP_DATABASE_URL;

const TEST_ARTISAN = 997001;

describe.skipIf(!OWNER_URL || !APP_URL)("paiements_stripe RLS — poller doit utiliser le rôle owner", () => {
  const owner = new Pool({ connectionString: OWNER_URL! });
  const tenant = new Pool({ connectionString: APP_URL! });

  afterAll(async () => {
    await owner.query('DELETE FROM paiements_stripe WHERE "artisanId" = $1', [TEST_ARTISAN]).catch(() => {});
    await owner.end();
    await tenant.end();
  });

  it("artisan_user (owner) voit les paiements en_attente — requis pour le poller", async () => {
    await owner.query(
      `INSERT INTO paiements_stripe ("artisanId", "factureId", "stripeSessionId", "tokenPaiement", statut, montant)
       VALUES ($1, 0, 'cs_rls_test', 'tok_rls_test', 'en_attente', '0.00')
       ON CONFLICT DO NOTHING`,
      [TEST_ARTISAN],
    );
    const { rows } = await owner.query(
      `SELECT id FROM paiements_stripe WHERE "artisanId" = $1 AND statut = 'en_attente'`,
      [TEST_ARTISAN],
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("app_tenant sans SET app.tenant voit 0 ligne — le poller cassait avant le fix", async () => {
    const { rows } = await tenant.query(
      `SELECT id FROM paiements_stripe WHERE "artisanId" = $1 AND statut = 'en_attente'`,
      [TEST_ARTISAN],
    );
    expect(rows.length).toBe(0);
  });
});

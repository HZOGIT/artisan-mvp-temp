import { describe, it, expect, afterAll } from "vitest";
import { Pool } from "pg";

/**
 * Anti-régression #347 : paiements_stripe est FORCE ROW LEVEL SECURITY.
 * Le poller doit utiliser DATABASE_URL (artisan_user, bypassrls) pour découvrir
 * les paiements orphelins — APP_DATABASE_URL (app_tenant) sans SET app.tenant = 0 lignes.
 */
const OWNER_URL = process.env.DATABASE_URL;
const APP_URL = process.env.APP_DATABASE_URL;

const TEST_ARTISAN = 997001;
/* ponytail: 20 min > MIN_AGE_SECONDS (10 min) pour être dans la fenêtre du poller */
const PAST_DATE = new Date(Date.now() - 20 * 60 * 1000);
const CUTOFF = new Date(Date.now() - 10 * 60 * 1000);

const DISCOVERY_SQL = `
  SELECT id, "artisanId", "factureId", "stripeSessionId", "tokenPaiement"
  FROM paiements_stripe
  WHERE statut = 'en_attente' AND "createdAt" < $1
`;

describe.skipIf(!OWNER_URL || !APP_URL)("paiements_stripe FORCE RLS — découverte poller", () => {
  const owner = new Pool({ connectionString: OWNER_URL! });
  const tenant = new Pool({ connectionString: APP_URL! });

  afterAll(async () => {
    await owner.query('DELETE FROM paiements_stripe WHERE "artisanId" = $1', [TEST_ARTISAN]).catch(() => {});
    await owner.end();
    await tenant.end();
  });

  it("requête découverte via pool OWNER retrouve le paiement en_attente ancien", async () => {
    await owner.query('DELETE FROM paiements_stripe WHERE "artisanId" = $1', [TEST_ARTISAN]);
    await owner.query(
      `INSERT INTO paiements_stripe ("artisanId", "factureId", "stripeSessionId", "tokenPaiement", statut, montant, "createdAt")
       VALUES ($1, 0, 'cs_rls_test', 'tok_rls_test', 'en_attente', '0.00', $2)`,
      [TEST_ARTISAN, PAST_DATE],
    );
    const { rows } = await owner.query<{ artisanId: number }>(DISCOVERY_SQL, [CUTOFF]);
    expect(rows.some((r) => r.artisanId === TEST_ARTISAN)).toBe(true);
  });

  it("app_tenant sans SET app.tenant voit 0 ligne (FORCE RLS) — le poller cassait avant le fix", async () => {
    const { rows } = await tenant.query(DISCOVERY_SQL, [CUTOFF]);
    expect(rows.length).toBe(0);
  });
});

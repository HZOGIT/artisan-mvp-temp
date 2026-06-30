import { describe, it, expect, afterAll } from "vitest";
import { Pool } from "pg";

/**
 * Anti-régression OPE-998 : active_sessions est FORCE ROW LEVEL SECURITY.
 * Un accès via app_tenant sans SET app.tenant doit voir 0 ligne.
 * Le purge RGPD utilise DATABASE_URL (artisan_user, bypassrls) — non impacté.
 */
const OWNER_URL = process.env.DATABASE_URL;
const APP_URL = process.env.APP_DATABASE_URL;

const TEST_ARTISAN = 998_001;
const TEST_USER = 998_001;
const PAST = new Date(Date.now() + 3600 * 1000);

describe.skipIf(!OWNER_URL || !APP_URL)("active_sessions FORCE RLS — isolation tenant", () => {
  const owner = new Pool({ connectionString: OWNER_URL! });
  const tenant = new Pool({ connectionString: APP_URL! });

  afterAll(async () => {
    await owner.query("DELETE FROM active_sessions WHERE artisan_id = $1", [TEST_ARTISAN]).catch(() => {});
    await owner.end();
    await tenant.end();
  });

  it("setup — insère une session via owner", async () => {
    await owner.query("DELETE FROM active_sessions WHERE artisan_id = $1", [TEST_ARTISAN]);
    await owner.query(
      `INSERT INTO active_sessions (user_id, artisan_id, session_token, expires_at)
       VALUES ($1, $2, 'tok-rls-test', $3)`,
      [TEST_USER, TEST_ARTISAN, PAST],
    );
    const { rows } = await owner.query(
      "SELECT id FROM active_sessions WHERE artisan_id = $1",
      [TEST_ARTISAN],
    );
    expect(rows).toHaveLength(1);
  });

  it("app_tenant sans SET app.tenant voit 0 ligne (FORCE RLS)", async () => {
    const { rows } = await tenant.query(
      "SELECT id FROM active_sessions WHERE artisan_id = $1",
      [TEST_ARTISAN],
    );
    expect(rows).toHaveLength(0);
  });

  it("owner bypasse la RLS — purge RGPD non impactée", async () => {
    const { rows } = await owner.query(
      "SELECT id FROM active_sessions WHERE artisan_id = $1",
      [TEST_ARTISAN],
    );
    expect(rows).toHaveLength(1);
  });
});

import { describe, it, expect, vi, afterAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../shared/db/client";
import { SuperPdpPaAdapter } from "../../shared/ports/superpdp-pa-adapter";
import { sql } from "drizzle-orm";
import { withTenant } from "../../shared/db/with-tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ??
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

describe.skipIf(!URL)("SuperPDP OAuth — adapter token L2", () => {
  const admin = new Pool({ connectionString: URL });
  const db = createDbClient(URL!);
  const appDb = createDbClient(APP_URL!);
  let artisanId = 0;

  afterAll(async () => {
    if (artisanId) await admin.query(`delete from superpdp_tokens where "artisanId" = $1`, [artisanId]).catch(() => {});
    if (artisanId) await admin.query(`delete from artisans where id = $1`, [artisanId]).catch(() => {});
    await db.close().catch(() => {});
    await appDb.close().catch(() => {});
    await admin.end();
  });

  it("setup : crée artisan de test", async () => {
    const u = (await admin.query("insert into users default values returning id")).rows[0].id as number;
    artisanId = (await admin.query(`insert into artisans ("userId") values ($1) returning id`, [u])).rows[0].id as number;
    expect(artisanId).toBeGreaterThan(0);
  });

  it("upsertToken stocke le token et getTokenForArtisan le retourne", async () => {
    const adapter = new SuperPdpPaAdapter("client_id", "client_secret", "https://sandbox.superpdp.tech", db.db);
    const expiresAt = new Date(Date.now() + 3600 * 1000);

    await adapter.upsertToken(artisanId, { accessToken: "tok-123", refreshToken: "refresh-abc", expiresAt });

    const token = await adapter.getTokenForArtisan(artisanId);
    expect(token).toBe("tok-123");
  });

  it("getTokenForArtisan retourne null si aucun token", async () => {
    const adapter = new SuperPdpPaAdapter("client_id", "client_secret", "https://sandbox.superpdp.tech", db.db);
    const unknownId = 999_999;
    const token = await adapter.getTokenForArtisan(unknownId);
    expect(token).toBeNull();
  });

  it("getTokenForArtisan rafraîchit si expiré (mock fetch)", async () => {
    const adapter = new SuperPdpPaAdapter("client_id", "client_secret", "https://sandbox.superpdp.tech", db.db);

    const expiredAt = new Date(Date.now() - 10_000);
    await adapter.upsertToken(artisanId, { accessToken: "old-tok", refreshToken: "ref-xyz", expiresAt: expiredAt });

    const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "new-tok", refresh_token: "new-ref", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const token = await adapter.getTokenForArtisan(artisanId);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(token).toBe("new-tok");

    const stored = await withTenant(appDb.db, { artisanId, userId: 0 }, async (tx) => {
      const r = await tx.execute(sql`select "accessToken" from superpdp_tokens where "artisanId" = ${artisanId}`);
      return (r.rows[0] as { accessToken: string }).accessToken;
    });
    expect(stored).toBe("new-tok");

    mockFetch.mockRestore();
  });
});

import { describe, it, expect, vi, afterAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../shared/db/client";
import { SuperPdpPaAdapter } from "../../shared/ports/superpdp-pa-adapter";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ??
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

/** Pool app_tenant : tous les inserts passent par la RLS (même comportement qu'en prod). */
describe.skipIf(!URL)("SuperPDP OAuth — adapter token L2 (pool app_tenant, sans GUC manuel)", () => {
  const admin = new Pool({ connectionString: URL });
  const appDb = createDbClient(APP_URL!);
  let artisanAId = 0;
  let artisanBId = 0;

  afterAll(async () => {
    if (artisanAId) await admin.query(`delete from superpdp_tokens where "artisanId" = $1`, [artisanAId]).catch(() => {});
    if (artisanBId) await admin.query(`delete from superpdp_tokens where "artisanId" = $1`, [artisanBId]).catch(() => {});
    if (artisanAId) await admin.query(`delete from artisans where id = $1`, [artisanAId]).catch(() => {});
    if (artisanBId) await admin.query(`delete from artisans where id = $1`, [artisanBId]).catch(() => {});
    await appDb.close().catch(() => {});
    await admin.end();
  });

  it("setup : crée deux artisans distincts", async () => {
    const uA = (await admin.query("insert into users default values returning id")).rows[0].id as number;
    artisanAId = (await admin.query(`insert into artisans ("userId") values ($1) returning id`, [uA])).rows[0].id as number;
    const uB = (await admin.query("insert into users default values returning id")).rows[0].id as number;
    artisanBId = (await admin.query(`insert into artisans ("userId") values ($1) returning id`, [uB])).rows[0].id as number;
    expect(artisanAId).toBeGreaterThan(0);
    expect(artisanBId).toBeGreaterThan(0);
  });

  it("upsertToken + getTokenForArtisan via appDb sans GUC manuel → persiste et relit", async () => {
    const adapter = new SuperPdpPaAdapter("cid", "cs", "https://sandbox", appDb.db);
    const expiresAt = new Date(Date.now() + 3600 * 1000);

    await adapter.upsertToken(artisanAId, { accessToken: "tok-123", refreshToken: "ref-abc", expiresAt });
    const token = await adapter.getTokenForArtisan(artisanAId);
    expect(token).toBe("tok-123");
  });

  it("getTokenForArtisan retourne null si aucun token pour cet artisan", async () => {
    const adapter = new SuperPdpPaAdapter("cid", "cs", "https://sandbox", appDb.db);
    const token = await adapter.getTokenForArtisan(999_999);
    expect(token).toBeNull();
  });

  it("isolation cross-tenant — session artisan B (GUC=artisanBId) ne voit pas le token de A", async () => {
    const adapter = new SuperPdpPaAdapter("cid", "cs", "https://sandbox", appDb.db);
    /**
     * getTokenForArtisan(artisanBId) pose app.tenant=artisanBId
     * → RLS filtre sur artisanId=artisanBId → le token de A est invisible.
     */
    const token = await adapter.getTokenForArtisan(artisanBId);
    expect(token).toBeNull();
  });

  it("getTokenForArtisan rafraîchit si expiré (mock fetch) et met à jour la DB", async () => {
    const adapter = new SuperPdpPaAdapter("cid", "cs", "https://sandbox", appDb.db);
    const expiredAt = new Date(Date.now() - 10_000);
    await adapter.upsertToken(artisanAId, { accessToken: "old-tok", refreshToken: "ref-xyz", expiresAt: expiredAt });

    const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "new-tok", refresh_token: "new-ref", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const token = await adapter.getTokenForArtisan(artisanAId);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(token).toBe("new-tok");

    /** Vérifie la persistance via l'adaptateur lui-même (pas de GUC manuel) */
    const stored = await adapter.getTokenForArtisan(artisanAId);
    expect(stored).toBe("new-tok");

    mockFetch.mockRestore();
  });
});

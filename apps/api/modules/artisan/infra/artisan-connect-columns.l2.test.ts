import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { ArtisanRepositoryDrizzle } from "./artisan-repository-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UA = 994501;
const UB = 994502;
const ctx = (id: number) => ({ artisanId: id, userId: 1 });

describe.skipIf(!URL)("Colonnes Connect sur artisans (L2 — app_tenant, RLS hors-tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new ArtisanRepositoryDrizzle(app.db);
  let aId = 0;
  let bId = 0;

  const cleanup = async () => {
    await admin.query('delete from artisans where "userId" in ($1,$2)', [UA, UB]);
    await admin.query("delete from users where id in ($1,$2)", [UA, UB]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UB, `u${UB}@t.fr`]);
    aId = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UA, "Connect A"])).rows[0].id;
    bId = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UB, "Connect B"])).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("colonnes Connect présentes avec valeurs par défaut sûres", async () => {
    const p = await repo.getProfile(ctx(aId));
    expect(p).not.toBeNull();
    expect(p!.stripeConnectAccountId).toBeNull();
    expect(p!.stripeConnectChargesEnabled).toBe(false);
    expect(p!.stripeConnectPayoutsEnabled).toBe(false);
    expect(p!.stripeConnectDetailsSubmitted).toBe(false);
    expect(p!.stripeConnectRequirements).toBeNull();
    expect(p!.stripeConnectStatus).toBe("none");
    expect(p!.stripeConnectConnectedAt).toBeNull();
    expect(p!.stripeConnectUpdatedAt).toBeNull();
  });

  it("owner peut écrire le statut Connect, app_tenant lit correctement", async () => {
    const accountId = "acct_test123";
    const connectedAt = new Date("2026-06-30T10:00:00Z");
    await admin.query(
      `UPDATE artisans SET
        stripe_connect_account_id=$1,
        stripe_connect_charges_enabled=true,
        stripe_connect_payouts_enabled=true,
        stripe_connect_details_submitted=true,
        stripe_connect_status='active',
        stripe_connect_connected_at=$2,
        stripe_connect_updated_at=$2
       WHERE id=$3`,
      [accountId, connectedAt, aId],
    );
    const p = await repo.getProfile(ctx(aId));
    expect(p!.stripeConnectAccountId).toBe(accountId);
    expect(p!.stripeConnectChargesEnabled).toBe(true);
    expect(p!.stripeConnectPayoutsEnabled).toBe(true);
    expect(p!.stripeConnectDetailsSubmitted).toBe(true);
    expect(p!.stripeConnectStatus).toBe("active");
    expect(p!.stripeConnectConnectedAt).toEqual(connectedAt);
  });

  it("stripeConnectAccountId UNIQUE : deux artisans ne partagent pas le même account Stripe", async () => {
    await admin.query(
      "UPDATE artisans SET stripe_connect_account_id=$1 WHERE id=$2",
      ["acct_unique_test", aId],
    );
    await expect(
      admin.query("UPDATE artisans SET stripe_connect_account_id=$1 WHERE id=$2", ["acct_unique_test", bId]),
    ).rejects.toThrow(/unique/i);
  });

  it("pas de fuite cross-tenant : app_tenant A ne voit pas le compte Connect de B", async () => {
    await admin.query("UPDATE artisans SET stripe_connect_account_id=$1 WHERE id=$2", ["acct_b_secret", bId]);
    const pA = await repo.getProfile(ctx(aId));
    const pB = await repo.getProfile(ctx(bId));
    expect(pA!.stripeConnectAccountId).not.toBe("acct_b_secret");
    expect(pB!.stripeConnectAccountId).toBe("acct_b_secret");
  });

  it("CHECK statut : valeur invalide rejetée", async () => {
    await expect(
      admin.query("UPDATE artisans SET stripe_connect_status=$1 WHERE id=$2", ["invalid_status", aId]),
    ).rejects.toThrow(/check/i);
  });
});

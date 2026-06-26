import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const UID_A = 9952401;
const UID_B = 9952402;
const EMAIL_A = `u${UID_A}@t.fr`;
const EMAIL_B = `u${UID_B}@t.fr`;

const jwt = (userId: number) =>
  new SignJWT({ userId, email: userId === UID_A ? EMAIL_A : EMAIL_B }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

describe.skipIf(!URL)("events.list L2/L3 — isolation tenant (RLS off, filtre artisanId)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;
  let artisanIdA: number;
  let artisanIdB: number;

  const cleanup = async () => {
    await admin.query('delete from "events" where "artisanId" in (select id from artisans where "userId" in ($1,$2))', [UID_A, UID_B]);
    await admin.query('delete from artisans where "userId" in ($1,$2)', [UID_A, UID_B]);
    await admin.query("delete from users where id in ($1,$2)", [UID_A, UID_B]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID_A, EMAIL_A]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UID_B, EMAIL_B]);
    const resA = await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_A, "Artisan A SARL"]);
    const resB = await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_B, "Artisan B SARL"]);
    artisanIdA = resA.rows[0].id;
    artisanIdB = resB.rows[0].id;

    await admin.query(
      'insert into "events" ("artisanId", action, "entityType", "entityId", "occurred_at") values ($1, $2, $3, $4, now())',
      [artisanIdA, "FACTURE_PAYEE", "Facture", 100],
    );
    await admin.query(
      'insert into "events" ("artisanId", action, "entityType", "entityId", "occurred_at") values ($1, $2, $3, $4, now())',
      [artisanIdA, "DEVIS_ACCEPTE", "Devis", 1],
    );
    await admin.query(
      'insert into "events" ("artisanId", action, "entityType", "entityId", "occurred_at") values ($1, $2, $3, $4, now())',
      [artisanIdB, "FACTURE_PAYEE", "Facture", 200],
    );

    app = buildApp({ jwtSecret: SECRET });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("sans cookie → 401", async () => {
    expect((await injectTrpc(app, "GET", "events.list", { page: 1 })).statusCode).toBe(401);
  });

  it("isolation tenant : A ne voit que ses propres événements (pas ceux de B)", async () => {
    const tok = await jwt(UID_A);
    const res = await injectTrpc(app, "GET", "events.list", { page: 1 }, tok);
    expect(res.statusCode).toBe(200);
    const items = res.json().result.data.items as Array<{ artisanId: number; action: string }>;
    expect(items.length).toBe(2);
    expect(items.every((e) => e.artisanId === artisanIdA)).toBe(true);
    expect(items.some((e) => e.action === "FACTURE_PAYEE")).toBe(true);
    expect(items.some((e) => e.action === "DEVIS_ACCEPTE")).toBe(true);
    expect(items.some((e) => e.artisanId === artisanIdB)).toBe(false);
  });

  it("filtre type appliqué : A filtre par type DEVIS_ACCEPTE", async () => {
    const tok = await jwt(UID_A);
    const res = await injectTrpc(app, "GET", "events.list", { page: 1, type: "DEVIS_ACCEPTE" }, tok);
    expect(res.statusCode).toBe(200);
    const items = res.json().result.data.items as Array<{ action: string }>;
    expect(items.length).toBe(1);
    expect(items[0].action).toBe("DEVIS_ACCEPTE");
  });

  it("tenant B voit seul ses événements", async () => {
    const tok = await jwt(UID_B);
    const res = await injectTrpc(app, "GET", "events.list", { page: 1 }, tok);
    expect(res.statusCode).toBe(200);
    const items = res.json().result.data.items as Array<{ artisanId: number }>;
    expect(items.length).toBe(1);
    expect(items[0].artisanId).toBe(artisanIdB);
  });
});

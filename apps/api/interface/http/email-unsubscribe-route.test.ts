import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { buildApp } from "../../app";
import { signUnsubscribeToken } from "../../shared/email/unsubscribe-token";

const URL = process.env.DATABASE_URL;
const SECRET = "unsubscribe-test-secret-32chars!!";
const TEST_EMAIL = "unsub-route-l3@example.com";

describe.skipIf(!URL)("email-unsubscribe-route (L3 e2e)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = () => admin.query("delete from email_optouts where email=$1", [TEST_EMAIL]);

  beforeAll(async () => {
    await cleanup();
    app = buildApp({ jwtSecret: SECRET, emailUnsubscribeSecret: SECRET });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("GET /api/emails/unsubscribe sans token → 400", async () => {
    const res = await app.inject({ method: "GET", url: "/api/emails/unsubscribe" });
    expect(res.statusCode).toBe(400);
  });

  it("GET /api/emails/unsubscribe token invalide → 400", async () => {
    const res = await app.inject({ method: "GET", url: "/api/emails/unsubscribe?token=invalid.bad" });
    expect(res.statusCode).toBe(400);
  });

  it("GET /api/emails/unsubscribe token valide → 200 HTML + opt-out enregistré", async () => {
    const token = signUnsubscribeToken(TEST_EMAIL, SECRET);
    const res = await app.inject({ method: "GET", url: `/api/emails/unsubscribe?token=${token}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("Désinscription confirmée");
    const row = await admin.query("select email from email_optouts where email=$1", [TEST_EMAIL]);
    expect(row.rowCount).toBe(1);
  });

  it("GET /api/emails/unsubscribe doublon → 200 HTML déjà désinscrit (idempotent)", async () => {
    const token = signUnsubscribeToken(TEST_EMAIL, SECRET);
    const res = await app.inject({ method: "GET", url: `/api/emails/unsubscribe?token=${token}` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Déjà désinscrit");
  });

  it("POST /api/emails/unsubscribe one-click RFC 8058 (token en querystring) → 200 JSON", async () => {
    const other = "unsub-oneclick-l3@example.com";
    await admin.query("delete from email_optouts where email=$1", [other]);
    const token = signUnsubscribeToken(other, SECRET);
    const res = await app.inject({
      method: "POST",
      url: `/api/emails/unsubscribe?token=${token}`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "List-Unsubscribe=One-Click",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    const row = await admin.query("select email from email_optouts where email=$1", [other]);
    expect(row.rowCount).toBe(1);
    await admin.query("delete from email_optouts where email=$1", [other]);
  });
});

import { describe, it, expect, vi, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../app";

const URL = process.env.DATABASE_URL;
const SECRET = "test-secret-superpdp-oauth-route-32ch";
const UID = 9_991_677;
const CLIENT_ID = "test-cid-677";
const CLIENT_SECRET = "test-cs-677";
const REDIRECT_URI = "https://staging.operioz.com/api/einvoicing/oauth/callback";
const SIRET = "12345678900001";

async function signToken(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@test.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

describe.skipIf(!URL)("superpdp-oauth-route — client_secret + redirect_uri dans l'échange token (L3)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = async () => {
    await admin.query('delete from artisans where "userId" = $1', [UID]).catch(() => {});
    await admin.query("delete from users where id = $1", [UID]).catch(() => {});
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email) values ($1, $2)", [UID, `u${UID}@test.fr`]);
    await admin.query('insert into artisans ("userId", siret) values ($1, $2)', [UID, SIRET]);
    process.env.PA_PROVIDER = "superpdp";
    process.env.SUPERPDP_CLIENT_ID = CLIENT_ID;
    process.env.SUPERPDP_CLIENT_SECRET = CLIENT_SECRET;
    process.env.SUPERPDP_REDIRECT_URI = REDIRECT_URI;
    app = buildApp({ jwtSecret: SECRET });
  });

  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
    delete process.env.PA_PROVIDER;
    delete process.env.SUPERPDP_CLIENT_ID;
    delete process.env.SUPERPDP_CLIENT_SECRET;
    delete process.env.SUPERPDP_REDIRECT_URI;
  });

  it("authorize redirige avec redirect_uri encodé dans l'URL SuperPDP", async () => {
    const jwt = await signToken(UID);
    const res = await app.inject({
      method: "GET",
      url: "/api/einvoicing/oauth/authorize",
      cookies: { token: jwt },
    });
    expect(res.statusCode).toBe(302);
    const location = res.headers["location"] as string;
    expect(location).toContain("redirect_uri=");
    expect(location).toContain(encodeURIComponent(REDIRECT_URI));
  });

  it("callback envoie client_secret + redirect_uri à l'échange token SuperPDP", async () => {
    const jwt = await signToken(UID);
    const state = "aabbccddeeff00112233445566778899";

    const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "acc-tok-677", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await app.inject({
      method: "GET",
      url: `/api/einvoicing/oauth/callback?code=AUTH_CODE_677&state=${state}`,
      cookies: { token: jwt, superpdp_oauth_state: state },
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, init] = mockFetch.mock.calls[0] as [unknown, RequestInit];
    const exchangeBody = new URLSearchParams(init.body as string);
    expect(exchangeBody.get("client_secret")).toBe(CLIENT_SECRET);
    expect(exchangeBody.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(exchangeBody.get("client_id")).toBe(CLIENT_ID);
    expect(exchangeBody.get("code")).toBe("AUTH_CODE_677");
    expect(res.statusCode).not.toBe(502);

    mockFetch.mockRestore();
  });
});

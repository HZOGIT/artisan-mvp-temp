import { createHmac } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../app";

const RAW_SECRET = "dGVzdHNlY3JldA=="; /* base64("testsecret") */
const SECRET = `whsec_${RAW_SECRET}`;

function sign(body: string, svixId = "msg_1", svixTimestamp = "1700000000"): string {
  const content = `${svixId}.${svixTimestamp}.${body}`;
  const sig = createHmac("sha256", Buffer.from(RAW_SECRET, "base64")).update(content).digest("base64");
  return `v1,${sig}`;
}

describe("POST /api/resend/webhook (signature Svix, fail-closed)", () => {
  let app: ReturnType<typeof buildApp>;

  beforeAll(() => {
    app = buildApp({ resendWebhookSecret: SECRET });
  });
  afterAll(async () => {
    await app?.close();
  });

  const post = (body: object, headers: Record<string, string> = {}) => {
    const raw = JSON.stringify(body);
    return app.inject({
      method: "POST",
      url: "/api/resend/webhook",
      headers: { "content-type": "application/json", ...headers },
      payload: raw,
    });
  };

  it("headers Svix manquants → 400", async () => {
    const res = await post({ type: "email.sent", data: {} });
    expect(res.statusCode).toBe(400);
  });

  it("signature altérée → 400", async () => {
    const body = { type: "email.sent", data: { email_id: "e1" } };
    const res = await post(body, {
      "svix-id": "msg_1",
      "svix-timestamp": "1700000000",
      "svix-signature": "v1,invalide",
    });
    expect(res.statusCode).toBe(400);
  });

  it("signature valide → 200", async () => {
    const body = { type: "email.delivered", data: { email_id: "e2" } };
    const raw = JSON.stringify(body);
    const res = await post(body, {
      "svix-id": "msg_2",
      "svix-timestamp": "1700000000",
      "svix-signature": sign(raw, "msg_2"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});

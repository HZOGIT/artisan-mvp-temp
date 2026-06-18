import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { buildApp } from "../../app";
import { FakeStripePort } from "../../shared/ports/stripe-adapter";

const URL = process.env.DATABASE_URL;
const SECRET = "whsec_test";

// E2E de la route `POST /api/stripe/webhook` via le routeur MONTÉ (buildApp + inject). Vérifie le
// mapping HTTP fail-closed ET que le parser raw-body encapsulé n'altère PAS le parsing JSON tRPC.
describe.skipIf(!URL)("POST /api/stripe/webhook (raw body, fail-closed, isolation tRPC)", () => {
  const stripe = new FakeStripePort();
  let app: ReturnType<typeof buildApp>;

  beforeAll(() => {
    app = buildApp({ stripePort: stripe, stripeWebhookSecret: SECRET });
  });
  afterAll(async () => {
    await app?.close();
  });

  const post = (payload: object, signature?: string) =>
    app.inject({
      method: "POST",
      url: "/api/stripe/webhook",
      headers: { "content-type": "application/json", ...(signature ? { "stripe-signature": signature } : {}) },
      payload: JSON.stringify(payload),
    });

  it("sans signature → 400", async () => {
    const res = await post({ id: "evt_1", type: "x", data: { object: {} } });
    expect(res.statusCode).toBe(400);
  });

  it("signature invalide → 400 (fail-closed)", async () => {
    const res = await post({ id: "evt_1", type: "x", data: { object: {} } }, "WRONG");
    expect(res.statusCode).toBe(400);
  });

  it("event de test signé → 200 {verified}", async () => {
    const res = await post({ id: "evt_test_1", type: "x", data: { object: {} } }, "valid-sig");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ verified: true });
  });

  it("event non géré signé → 200 {received} (sans DB)", async () => {
    const res = await post({ id: "evt_2", type: "invoice.payment_succeeded", data: { object: {} } }, "valid-sig");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: true });
  });

  it("isolation : le parser raw-body du webhook ne casse PAS le JSON tRPC (health 200)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/trpc/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ result: { data: { json: { status: "ok" } } } });
  });
});

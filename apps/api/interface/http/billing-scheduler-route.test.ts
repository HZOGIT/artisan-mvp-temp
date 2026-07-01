import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Fastify from "fastify";
import { registerBillingSchedulerRoute } from "./billing-scheduler-route";

vi.mock("../../modules/billing/application/billing-scheduler", () => ({
  runSchedulerTick: vi.fn().mockResolvedValue({ charged: 0, zombiesRecovered: 0, cancelled: 0, trialsActivated: 0 }),
}));

describe("POST /internal/billing/tick — rotation secret (getter par requête)", () => {
  let currentSecret = "scheduler-secret-A";

  const app = Fastify();

  beforeAll(async () => {
    registerBillingSchedulerRoute(app, {
      secret: () => currentSecret,
      repo: {} as never,
      billing: {} as never,
      notifier: {} as never,
      appUrl: "http://test",
      db: {} as never,
      pdf: {} as never,
      emailLogWriter: {} as never,
      logger: app.log,
      observeOnly: true,
    });
    await app.ready();
  });

  afterAll(() => app.close());

  const tick = (secret: string) =>
    app.inject({ method: "POST", url: "/internal/billing/tick", headers: { "x-scheduler-secret": secret } });

  it("secret absent → 401", async () => {
    const res = await tick("");
    expect(res.statusCode).toBe(401);
  });

  it("secret incorrect → 401", async () => {
    const res = await tick("wrong");
    expect(res.statusCode).toBe(401);
  });

  it("secret correct → 200", async () => {
    const res = await tick("scheduler-secret-A");
    expect(res.statusCode).toBe(200);
  });

  it("rotation sans rebuild — nouveau secret accepté, ancien rejeté", async () => {
    currentSecret = "scheduler-secret-B";
    const resA = await tick("scheduler-secret-A");
    expect(resA.statusCode).toBe(401); /* ancien secret rejeté après rotation */
    const resB = await tick("scheduler-secret-B");
    expect(resB.statusCode).toBe(200); /* nouveau secret accepté */
  });
});

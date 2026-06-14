import { describe, it, expect } from "vitest";
import type { TenantContext } from "../../shared/tenant";
import { createSubscriptionModule } from "./subscription.module";
import { FakeSubscriptionReader } from "./infra/subscription-reader-fake";
import { getCurrent } from "./application/use-cases";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe("subscription.module", () => {
  it("câble le reader injecté + expose getCurrent", () => {
    const reader = new FakeSubscriptionReader();
    const module = createSubscriptionModule({ reader });
    expect(module.deps.reader).toBe(reader);
    expect(Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record)).toEqual(["getCurrent"]);
  });

  it("getCurrent : scopé tenant (un autre tenant → défauts)", async () => {
    const reader = new FakeSubscriptionReader();
    reader.seed(1, { id: 1, artisanId: 1, stripeCustomerId: null, stripeSubscriptionId: "sub_x", stripePriceId: null, plan: "pro", status: "active", trialEndsAt: null, currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, maxUsers: 5, maxDevicesPerUser: 3, maxConcurrentSessions: 2 });
    expect((await getCurrent(reader, ctx(1))).plan).toBe("pro");
    expect((await getCurrent(reader, ctx(2))).plan).toBe("trial"); // pas d'abonnement → défauts
  });
});

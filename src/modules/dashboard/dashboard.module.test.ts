import { describe, it, expect } from "vitest";
import { createDashboardModule } from "./dashboard.module";
import { FakeDashboardReader } from "./infra/dashboard-reader-fake";

describe("dashboard.module", () => {
  it("createDashboardModule câble le reader injecté", () => {
    const reader = new FakeDashboardReader();
    const module = createDashboardModule({ reader });
    expect(module.deps.reader).toBe(reader);
  });

  it("expose les 10 procédures tRPC du dashboard", () => {
    const module = createDashboardModule({ reader: new FakeDashboardReader() });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual([
      "getAlerts",
      "getClientEvolution",
      "getConversionRate",
      "getMonthlyCA",
      "getObjectifs",
      "getRecentActivity",
      "getStats",
      "getTopClients",
      "getUpcomingInterventions",
      "getYearlyComparison",
    ]);
  });
});

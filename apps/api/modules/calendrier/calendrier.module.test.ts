import { describe, it, expect } from "vitest";
import { createCalendrierModule } from "./calendrier.module";
import { FakeIcalFeedRepository } from "./infra/ical-feed-repository-fake";
import { randomHexToken } from "./infra/token-generator";

describe("calendrier.module", () => {
  it("createCalendrierModule câble le repository injecté", () => {
    const repo = new FakeIcalFeedRepository();
    const module = createCalendrierModule({ repository: repo });
    expect(module.deps.repository).toBe(repo);
  });

  it("expose le routeur tRPC (getIcalFeed/regenerateIcalFeed)", () => {
    const module = createCalendrierModule({ repository: new FakeIcalFeedRepository() });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual(["getIcalFeed", "regenerateIcalFeed"]);
  });

  it("randomHexToken : jeton hexadécimal de 48 caractères, non répété", () => {
    const a = randomHexToken();
    const b = randomHexToken();
    expect(a).toMatch(/^[0-9a-f]{48}$/);
    expect(a).not.toBe(b);
  });
});

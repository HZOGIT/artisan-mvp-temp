import { describe, it, expect } from "vitest";
import type { TenantContext } from "../../../shared/tenant";
import { FakeIcalFeedRepository } from "../infra/ical-feed-repository-fake";
import { getIcalFeed, regenerateIcalFeed } from "./use-cases";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe("calendrier use-cases", () => {
  it("getIcalFeed : génère le jeton paresseusement à la 1re demande, puis le réutilise", async () => {
    const repo = new FakeIcalFeedRepository();
    let n = 0;
    const gen = () => `tok${++n}`;
    const first = await getIcalFeed(repo, gen, ctx(1));
    expect(first).toEqual({ path: "/api/calendar/tok1.ics" });
    // 2e appel : le jeton existe déjà → pas de régénération.
    const second = await getIcalFeed(repo, gen, ctx(1));
    expect(second).toEqual({ path: "/api/calendar/tok1.ics" });
    expect(n).toBe(1);
  });

  it("getIcalFeed : réutilise un jeton préexistant sans le régénérer", async () => {
    const repo = new FakeIcalFeedRepository();
    repo.seedToken(1, "existant");
    const feed = await getIcalFeed(repo, () => "nouveau", ctx(1));
    expect(feed).toEqual({ path: "/api/calendar/existant.ics" });
  });

  it("regenerateIcalFeed : remplace le jeton (révoque l'ancien)", async () => {
    const repo = new FakeIcalFeedRepository();
    repo.seedToken(1, "ancien");
    const feed = await regenerateIcalFeed(repo, () => "rotated", ctx(1));
    expect(feed).toEqual({ path: "/api/calendar/rotated.ics" });
    expect(await repo.getToken(ctx(1))).toBe("rotated");
  });

  it("jetons scopés par tenant (pas de partage entre artisans)", async () => {
    const repo = new FakeIcalFeedRepository();
    await getIcalFeed(repo, () => "tokA", ctx(1));
    await getIcalFeed(repo, () => "tokB", ctx(2));
    expect(await repo.getToken(ctx(1))).toBe("tokA");
    expect(await repo.getToken(ctx(2))).toBe("tokB");
  });
});

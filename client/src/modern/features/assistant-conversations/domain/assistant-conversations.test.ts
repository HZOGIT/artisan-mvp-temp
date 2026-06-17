import { describe, expect, it } from "vitest";
import { relativeTime } from "./assistant-conversations";

describe("assistant-conversations — relativeTime (pur)", () => {
  const now = new Date("2026-06-17T12:00:00Z").getTime();
  it("< 1 min → instant", () => {
    expect(relativeTime(new Date(now - 30_000), now)).toEqual({ kind: "instant" });
  });
  it("minutes", () => {
    expect(relativeTime(new Date(now - 5 * 60_000), now)).toEqual({ kind: "min", value: 5 });
  });
  it("heures", () => {
    expect(relativeTime(new Date(now - 3 * 3600_000), now)).toEqual({ kind: "h", value: 3 });
  });
  it("jours (< 7)", () => {
    expect(relativeTime(new Date(now - 2 * 86400_000), now)).toEqual({ kind: "j", value: 2 });
  });
  it("≥ 7 jours → date ISO", () => {
    const r = relativeTime(new Date(now - 10 * 86400_000), now);
    expect(r.kind).toBe("date");
  });
});

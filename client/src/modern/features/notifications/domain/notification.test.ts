import { describe, expect, it } from "vitest";
import { relativeDateDescriptor } from "./notification";

// Date relative PURE testée de façon déterministe (on injecte `now`). Reproduit les seuils du legacy.
describe("relativeDateDescriptor", () => {
  const now = new Date("2026-06-17T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const MIN = 60_000;
  const H = 60 * MIN;
  const D = 24 * H;

  it("< 1 min → instant", () => {
    expect(relativeDateDescriptor(ago(30_000), now)).toEqual({ kind: "instant" });
  });
  it("minutes", () => {
    expect(relativeDateDescriptor(ago(5 * MIN), now)).toEqual({ kind: "minutes", n: 5 });
    expect(relativeDateDescriptor(ago(59 * MIN), now)).toEqual({ kind: "minutes", n: 59 });
  });
  it("heures", () => {
    expect(relativeDateDescriptor(ago(3 * H), now)).toEqual({ kind: "hours", n: 3 });
    expect(relativeDateDescriptor(ago(23 * H), now)).toEqual({ kind: "hours", n: 23 });
  });
  it("hier", () => {
    expect(relativeDateDescriptor(ago(25 * H), now)).toEqual({ kind: "yesterday" });
  });
  it("jours (< 7)", () => {
    expect(relativeDateDescriptor(ago(3 * D), now)).toEqual({ kind: "days", n: 3 });
  });
  it(">= 7 jours → date absolue", () => {
    const r = relativeDateDescriptor(ago(10 * D), now);
    expect(r.kind).toBe("date");
    if (r.kind === "date") expect(r.value.getTime()).toBe(ago(10 * D).getTime());
  });
  it("accepte une string ISO", () => {
    expect(relativeDateDescriptor("2026-06-17T11:30:00Z", now)).toEqual({ kind: "minutes", n: 30 });
  });
});

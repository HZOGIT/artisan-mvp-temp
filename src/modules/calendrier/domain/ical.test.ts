import { describe, it, expect } from "vitest";
import { icalPath } from "./ical";

describe("icalPath (pur)", () => {
  it("construit le chemin d'abonnement à partir du jeton", () => {
    expect(icalPath("abc123")).toBe("/api/calendar/abc123.ics");
  });
});

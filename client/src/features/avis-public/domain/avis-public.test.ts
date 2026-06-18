import { describe, expect, it } from "vitest";
import { noteLabelKey, formatDate } from "./avis-public";

describe("avis-public — domain pur", () => {
  it("noteLabelKey : 1–5 → clés, hors plage → null", () => {
    expect(noteLabelKey(1)).toBe("note1");
    expect(noteLabelKey(5)).toBe("note5");
    expect(noteLabelKey(0)).toBeNull();
    expect(noteLabelKey(6)).toBeNull();
  });
  it("formatDate : date longue FR", () => {
    expect(formatDate("2026-06-18")).toContain("2026");
    expect(formatDate("2026-06-18")).toContain("juin");
  });
});

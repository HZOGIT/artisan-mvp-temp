import { describe, it, expect } from "vitest";
import { clampLimit } from "./email-log";

describe("clampLimit (pur)", () => {
  it("défaut 100 si absent, borné [1,500]", () => {
    expect(clampLimit(undefined)).toBe(100);
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(-5)).toBe(1);
    expect(clampLimit(250)).toBe(250);
    expect(clampLimit(999)).toBe(500);
  });
});

import { describe, it, expect } from "vitest";
import { isAllowedLogoMime, logoDataUrl, ALLOWED_LOGO_MIMES, MAX_LOGO_BYTES } from "./logo";

describe("logo domain (pur)", () => {
  it("isAllowedLogoMime : png/jpeg/webp/svg autorisés, autres refusés", () => {
    for (const m of ALLOWED_LOGO_MIMES) expect(isAllowedLogoMime(m)).toBe(true);
    expect(isAllowedLogoMime("image/gif")).toBe(false);
    expect(isAllowedLogoMime("application/pdf")).toBe(false);
    expect(isAllowedLogoMime("text/html")).toBe(false);
  });

  it("logoDataUrl : data-URL base64", () => {
    expect(logoDataUrl("image/png", Buffer.from("abc"))).toBe(`data:image/png;base64,${Buffer.from("abc").toString("base64")}`);
  });

  it("MAX_LOGO_BYTES = 2 Mo", () => {
    expect(MAX_LOGO_BYTES).toBe(2 * 1024 * 1024);
  });
});

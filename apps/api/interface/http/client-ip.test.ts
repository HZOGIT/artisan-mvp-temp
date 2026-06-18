import { describe, it, expect } from "vitest";
import { extractClientIp, extractUserAgent } from "./client-ip";

describe("extractClientIp (valeur probante)", () => {
  it("priorise cf-connecting-ip (non falsifiable) sur x-forwarded-for", () => {
    expect(
      extractClientIp({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2, 3.3.3.3" }),
    ).toBe("1.1.1.1");
  });

  it("repli sur la 1ʳᵉ IP de x-forwarded-for si pas de cf-connecting-ip", () => {
    expect(extractClientIp({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" })).toBe("2.2.2.2");
  });

  it("repli sur le fallback (req.ip) sinon", () => {
    expect(extractClientIp({}, "9.9.9.9")).toBe("9.9.9.9");
  });

  it("'unknown' si rien d'exploitable", () => {
    expect(extractClientIp({})).toBe("unknown");
    expect(extractClientIp({ "x-forwarded-for": "  " }, "")).toBe("unknown");
  });

  it("borne à 45 caractères (colonne ipAddress)", () => {
    const long = "a".repeat(80);
    expect(extractClientIp({ "cf-connecting-ip": long }).length).toBe(45);
  });

  it("gère un header tableau (prend le 1er)", () => {
    expect(extractClientIp({ "cf-connecting-ip": ["4.4.4.4", "5.5.5.5"] })).toBe("4.4.4.4");
  });
});

describe("extractUserAgent", () => {
  it("renvoie l'UA ou 'unknown'", () => {
    expect(extractUserAgent({ "user-agent": "Mozilla/5.0" })).toBe("Mozilla/5.0");
    expect(extractUserAgent({})).toBe("unknown");
  });
});

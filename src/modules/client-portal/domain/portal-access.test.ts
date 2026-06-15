import { describe, it, expect } from "vitest";
import { buildPortalUrl, clientNomComplet, computeExpiry, safeHtml, buildAccessEmailBody } from "./portal-access";

describe("portal-access domain", () => {
  it("computeExpiry : +90 jours par défaut", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    expect(computeExpiry(now).getTime() - now.getTime()).toBe(90 * 86_400_000);
  });
  it("buildPortalUrl", () => {
    expect(buildPortalUrl("https://app.fr", "abc")).toBe("https://app.fr/portail/abc");
  });
  it("clientNomComplet : prénom + nom, trim", () => {
    expect(clientNomComplet("Jean", "Dupont")).toBe("Jean Dupont");
    expect(clientNomComplet(null, "Martin")).toBe("Martin");
  });
  it("safeHtml échappe", () => {
    expect(safeHtml(`<a>&'`)).toBe("&lt;a&gt;&amp;&#39;");
  });
  it("buildAccessEmailBody : contient le lien + noms échappés", () => {
    const body = buildAccessEmailBody("ACME <b>", "Jean", "https://app.fr/portail/tok");
    expect(body).toContain("https://app.fr/portail/tok");
    expect(body).toContain("ACME &lt;b&gt;");
    expect(body).toContain("Bonjour Jean");
  });
});

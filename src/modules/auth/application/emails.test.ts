import { describe, it, expect } from "vitest";
import { welcomeEmail, resetPasswordEmail } from "./emails";

// Corps HTML des emails d'auth. Points sensibles : échappement HTML du `name` (anti-XSS), URL de
// confiance (APP_URL injectée, jamais l'Origin), fallback d'URL.
describe("welcomeEmail", () => {
  it("interpole le nom (« Bonjour <name>, ») et le lien dashboard depuis appUrl", () => {
    const html = welcomeEmail("Marie", "https://staging.operioz.com");
    expect(html).toContain("Bonjour Marie,");
    expect(html).toContain('href="https://staging.operioz.com/dashboard"');
  });

  it("sans nom → « Bonjour, » (pas de nom interpolé)", () => {
    const html = welcomeEmail(undefined);
    expect(html).toContain("Bonjour,");
  });

  it("fallback APP_URL par défaut quand aucune URL fournie", () => {
    expect(welcomeEmail("X")).toContain('href="https://www.operioz.com/dashboard"');
  });

  it("ÉCHAPPE le HTML du nom (anti-XSS) — pas d'injection de balise", () => {
    const html = welcomeEmail(`<script>alert('x')</script>&"`);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
    expect(html).toContain("&#39;");
    expect(html).toContain("&quot;");
  });
});

describe("resetPasswordEmail", () => {
  it("place le resetUrl dans le bouton et mentionne la validité 1 heure", () => {
    const url = "https://staging.operioz.com/reset?token=abc123";
    const html = resetPasswordEmail(url);
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain("1 heure");
  });
});

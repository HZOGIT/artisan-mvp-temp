import { describe, it, expect } from "vitest";
import { apercu, escapeHtml, buildNewMessageEmail } from "./chat";

describe("chat domain", () => {
  it("apercu : 100 premiers caractères", () => {
    expect(apercu("a".repeat(150))).toHaveLength(100);
    expect(apercu("court")).toBe("court");
  });

  it("escapeHtml : neutralise l'injection", () => {
    expect(escapeHtml('<b>"x"&y</b>')).toBe("&lt;b&gt;&quot;x&quot;&amp;y&lt;/b&gt;");
  });

  it("buildNewMessageEmail : sujet + corps (client/artisan échappés, lien portail)", () => {
    const { subject, body } = buildNewMessageEmail({ clientName: "Jean", artisanName: "Plomberie & Co", contenu: "Bonjour", portalLink: "https://app.test/portail/tok" });
    expect(subject).toBe("Nouveau message de Plomberie & Co");
    expect(body).toContain("Bonjour Jean,");
    expect(body).toContain("Plomberie &amp; Co");
    expect(body).toContain("https://app.test/portail/tok");
    expect(body).toContain("Répondre sur le portail");
  });

  it("buildNewMessageEmail : sans lien portail → pas de CTA ; contenu tronqué à 300", () => {
    const long = "x".repeat(400);
    const { body } = buildNewMessageEmail({ clientName: "C", artisanName: "", contenu: long, portalLink: null });
    expect(body).not.toContain("Répondre sur le portail");
    expect(body).toContain("votre artisan");
    expect(body).toContain("x".repeat(300) + "...");
  });
});

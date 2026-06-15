import { describe, it, expect } from "vitest";
import {
  generateSignatureToken,
  computeSignatureExpiry,
  escapeHtml,
  formatEuro,
  buildSignatureLinkEmail,
} from "./signature";

describe("signature domain", () => {
  it("generateSignatureToken : 64 caractères hex, imprévisible (distinct)", () => {
    const a = generateSignatureToken();
    const b = generateSignatureToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it("computeSignatureExpiry : +30 jours par défaut sans muter l'entrée", () => {
    const now = new Date("2026-06-15T08:00:00Z");
    const exp = computeSignatureExpiry(now);
    expect(exp.toISOString()).toBe("2026-07-15T08:00:00.000Z");
    expect(now.toISOString()).toBe("2026-06-15T08:00:00.000Z");
    expect(computeSignatureExpiry(now, 7).toISOString()).toBe("2026-06-22T08:00:00.000Z");
  });

  it("escapeHtml : neutralise l'injection HTML", () => {
    expect(escapeHtml(`<b>"a"&'b'</b>`)).toBe("&lt;b&gt;&quot;a&quot;&amp;&#39;b&#39;&lt;/b&gt;");
  });

  it("formatEuro : format FR avec symbole €", () => {
    expect(formatEuro(1200).replace(/ | /g, " ")).toBe("1 200,00 €");
    expect(formatEuro(NaN).replace(/ | /g, " ")).toBe("0,00 €");
  });

  it("buildSignatureLinkEmail : sujet + corps avec montant, lien et objet échappés", () => {
    const { subject, body } = buildSignatureLinkEmail({
      artisanName: "Toiture & Co",
      clientName: "Jean",
      devisNumero: "DEV-1",
      devisObjet: "<script>",
      totalTTC: 1200,
      signatureUrl: "https://app.test/devis-public/tok",
    });
    expect(subject).toBe("Devis DEV-1 à signer - Toiture & Co");
    expect(body).toContain("https://app.test/devis-public/tok");
    expect(body).toContain("Toiture &amp; Co");
    expect(body).toContain("&lt;script&gt;");
    expect(body).not.toContain("<script>");
  });
});

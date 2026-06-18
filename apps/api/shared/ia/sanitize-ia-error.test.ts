import { describe, it, expect } from "vitest";
import { sanitizeIaError } from "./sanitize-ia-error";

// Assainisseur des messages d'erreur IA renvoyés au client : extrait .message, masque images base64 /
// blobs longs, tronque à 200. Pur.
describe("sanitizeIaError", () => {
  it("extrait le .message d'un Error", () => {
    expect(sanitizeIaError(new Error("boom"))).toBe("boom");
  });

  it("accepte une chaîne brute telle quelle", () => {
    expect(sanitizeIaError("oops")).toBe("oops");
  });

  it("null/undefined → fallback (défaut « Erreur IA », ou personnalisé)", () => {
    expect(sanitizeIaError(null)).toBe("Erreur IA");
    expect(sanitizeIaError(undefined)).toBe("Erreur IA");
    expect(sanitizeIaError(null, "IA indisponible")).toBe("IA indisponible");
  });

  it("masque une data-URL image base64 → [image]", () => {
    const out = sanitizeIaError(new Error("échec sur data:image/png;base64,AAAABBBBCCCCDDDD fin"));
    expect(out).toContain("[image]");
    expect(out).not.toContain("base64,AAAABBBB");
  });

  it("masque un blob alphanumérique long (≥200) → […]", () => {
    const blob = "A".repeat(250);
    const out = sanitizeIaError(new Error(blob));
    expect(out).toBe("[…]");
    expect(out).not.toContain("AAAA");
  });

  it("tronque à 200 caractères (+ …) un message long sans blob contigu", () => {
    const long = "erreur: " + "mot ".repeat(80); // > 200 chars, espacé (pas de run alnum de 200)
    const out = sanitizeIaError(new Error(long));
    expect(out.length).toBe(201); // 200 + le caractère "…"
    expect(out.endsWith("…")).toBe(true);
  });
});

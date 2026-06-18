import { describe, expect, it } from "vitest";
import { getTheme, computeInitials, clientNameShort, anneeCreation, buildJsonLd, buildContactMessage, type VitrineArtisan, type VitrineAvis, type VitrineAvisStats } from "./vitrine";

describe("vitrine-public — domain pur", () => {
  it("getTheme : spécialité connue / inconnue → autre", () => {
    expect(getTheme("plomberie").hex).toBe("#2563eb");
    expect(getTheme("inconnue").iconKey).toBe("autre");
    expect(getTheme(null).iconKey).toBe("autre");
  });
  it("computeInitials", () => {
    expect(computeInitials("Plomberie Dupont")).toBe("PD");
    expect(computeInitials(null)).toBe("A");
  });
  it("clientNameShort : Prénom N.", () => {
    expect(clientNameShort("Jean Dupont")).toBe("Jean D.");
    expect(clientNameShort("Madonna")).toBe("Madonna");
  });
  it("anneeCreation : année − expérience (null si invalide)", () => {
    expect(anneeCreation(10, new Date("2026-06-18"))).toBe(2016);
    expect(anneeCreation(0)).toBeNull();
    expect(anneeCreation(null)).toBeNull();
  });
  it("buildContactMessage : préfixe type", () => {
    expect(buildContactMessage("Plomberie", "Fuite")).toBe("[Plomberie] Fuite");
    expect(buildContactMessage("", "Fuite")).toBe("Fuite");
  });
  it("buildJsonLd : aggregateRating seulement si avis", () => {
    const artisan = { nomEntreprise: "ACME", telephone: "06", logo: null, ville: "Lyon", codePostal: "69000" } as unknown as VitrineArtisan;
    const stats0 = { moyenne: 0, total: 0, distribution: {} } as VitrineAvisStats;
    const ldNo = buildJsonLd(artisan, stats0, [], "http://x", false);
    expect(ldNo.aggregateRating).toBeUndefined();
    expect(ldNo.name).toBe("ACME");
    const stats = { moyenne: 4.5, total: 3, distribution: {} } as VitrineAvisStats;
    const avis = [{ id: 1, clientNom: "Jean D", note: 5, createdAt: "2026-01-01", commentaire: "Top", reponseArtisan: null, interventionId: 1 }] as VitrineAvis[];
    const ld = buildJsonLd(artisan, stats, avis, "http://x", true);
    expect((ld.aggregateRating as { reviewCount: number }).reviewCount).toBe(3);
  });
});

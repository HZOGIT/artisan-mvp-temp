import { describe, expect, it } from "vitest";
import { priceFor, ANNUAL_DISCOUNT, SECTION_COUNTS } from "./home";
import fr from "../i18n/fr.json";

describe("home — tarification (domain pur)", () => {
  it("priceFor : mensuel = plein tarif, annuel = −20% arrondi", () => {
    expect(priceFor(49, "monthly")).toBe(49);
    expect(priceFor(49, "annual")).toBe(Math.round(49 * (1 - ANNUAL_DISCOUNT))); // 39
    expect(priceFor(29, "annual")).toBe(23);
    expect(priceFor(89, "annual")).toBe(71);
  });
});

describe("home — cohérence i18n ↔ sections (parité legacy)", () => {
  it("chaque section i18n a le nombre d'éléments attendu", () => {
    expect((fr.features.primary as unknown[]).length).toBe(SECTION_COUNTS.primaryFeatures);
    expect((fr.features.secondary as unknown[]).length).toBe(SECTION_COUNTS.secondaryFeatures);
    expect((fr.sectors.items as unknown[]).length).toBe(SECTION_COUNTS.sectors);
    expect((fr.how.steps as unknown[]).length).toBe(SECTION_COUNTS.steps);
    expect((fr.pricing.plans as unknown[]).length).toBe(SECTION_COUNTS.plans);
    expect((fr.testimonials.items as unknown[]).length).toBe(SECTION_COUNTS.testimonials);
    expect((fr.faq.items as unknown[]).length).toBe(SECTION_COUNTS.faq);
  });
});

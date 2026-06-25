import { describe, it, expect } from "vitest";
import { enrichirModules, isPlanInsuffisant, resolveGatingPlan } from "./plan";
import type { ModuleCatalogue } from "./module";
import type { SubscriptionRow } from "../../subscription/domain/subscription";

const sub = (plan: string, status: string, trialEndsAt: Date | null = null): SubscriptionRow => ({
  id: 1, artisanId: 1, plan, status, trialEndsAt,
  currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false,
  maxUsers: 1, maxDevicesPerUser: 3, maxConcurrentSessions: 2,
});

const mod = (slug: string, planMinimum: string, actifParDefaut = false, ordre = 0): ModuleCatalogue => ({
  id: ordre + 1,
  slug,
  label: slug,
  description: null,
  icon: "x",
  categorie: "c",
  planMinimum,
  actifParDefaut,
  ordre,
});

describe("plan", () => {
  describe("resolveGatingPlan", () => {
    it("null (pas d'abonnement) → essentiel", () => {
      expect(resolveGatingPlan(null)).toBe("essentiel");
    });

    it("trial actif → entreprise (accès complet)", () => {
      const future = new Date(Date.now() + 7 * 24 * 3600 * 1000);
      expect(resolveGatingPlan(sub("starter", "trialing", future))).toBe("entreprise");
    });

    it("trial expiré → mapping du plan_id (starter → essentiel)", () => {
      const past = new Date(Date.now() - 1000);
      expect(resolveGatingPlan(sub("starter", "trialing", past))).toBe("essentiel");
    });

    it("trialing sans trialEndsAt → mapping du plan_id", () => {
      expect(resolveGatingPlan(sub("starter", "trialing", null))).toBe("essentiel");
    });

    it("active enterprise → entreprise", () => {
      expect(resolveGatingPlan(sub("enterprise", "active"))).toBe("entreprise");
    });

    it("active pro → pro", () => {
      expect(resolveGatingPlan(sub("pro", "active"))).toBe("pro");
    });

    it("active starter → essentiel", () => {
      expect(resolveGatingPlan(sub("starter", "active"))).toBe("essentiel");
    });

    it("plan inconnu → essentiel (défaut sécurisé)", () => {
      expect(resolveGatingPlan(sub("unknown", "active"))).toBe("essentiel");
    });
  });

  it("isPlanInsuffisant : hiérarchie essentiel < pro < entreprise", () => {
    expect(isPlanInsuffisant("pro", "essentiel")).toBe(true);
    expect(isPlanInsuffisant("pro", "pro")).toBe(false);
    expect(isPlanInsuffisant("essentiel", "pro")).toBe(false);
    expect(isPlanInsuffisant("entreprise", "pro")).toBe(true);
    // Plan inconnu/null → traité comme essentiel.
    expect(isPlanInsuffisant("pro", null)).toBe(true);
    expect(isPlanInsuffisant("inconnu", "essentiel")).toBe(false); // module à plan inconnu → seuil 0
  });

  it("enrichirModules : actif (slugs) + locked (plan), ordre conservé", () => {
    const catalogue = [mod("a", "essentiel", true, 0), mod("b", "pro", false, 1)];
    const out = enrichirModules(catalogue, ["a"], "essentiel");
    expect(out.map((m) => m.slug)).toEqual(["a", "b"]);
    expect(out.find((m) => m.slug === "a")).toMatchObject({ actif: true, locked: false });
    // b exige pro, tenant essentiel → locked ; pas dans les slugs actifs → actif false.
    expect(out.find((m) => m.slug === "b")).toMatchObject({ actif: false, locked: true });
  });
});

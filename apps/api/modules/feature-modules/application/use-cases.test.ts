import { describe, it, expect } from "vitest";
import { ForbiddenError, NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import { FakeModulesRepository } from "../infra/modules-repository-fake";
import { FakeSubscriptionReader, blankSub } from "../../subscription/infra/subscription-reader-fake";
import type { ModuleCatalogue } from "../domain/module";
import {
  completeOnboarding,
  getOnboardingStatus,
  listModules,
  skipOnboarding,
  toggleModule,
} from "./use-cases";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = 1;

const catalogue: ModuleCatalogue[] = [
  { id: 1, slug: "facturation", label: "Facturation", description: null, icon: "x", categorie: "core", planMinimum: "essentiel", actifParDefaut: true, ordre: 0 },
  { id: 2, slug: "stocks", label: "Stocks", description: null, icon: "x", categorie: "ops", planMinimum: "pro", actifParDefaut: false, ordre: 1 },
  { id: 3, slug: "compta", label: "Compta", description: null, icon: "x", categorie: "fin", planMinimum: "entreprise", actifParDefaut: false, ordre: 2 },
];

function readerWithPlan(artisanId: number, plan: string, status = "active"): FakeSubscriptionReader {
  const reader = new FakeSubscriptionReader();
  reader.seed(artisanId, { ...blankSub(artisanId), plan, status, trialEndsAt: null });
  return reader;
}

function readerTrialing(artisanId: number, trialEndsAt: Date): FakeSubscriptionReader {
  const reader = new FakeSubscriptionReader();
  reader.seed(artisanId, { ...blankSub(artisanId), plan: "starter", status: "trialing", trialEndsAt });
  return reader;
}

describe("modules use-cases", () => {
  it("listModules : fallback défauts si aucune préférence, locked selon le plan réel (pro)", async () => {
    const repo = new FakeModulesRepository(catalogue);
    const reader = readerWithPlan(A, "pro");
    const list = await listModules(repo, reader, ctx(A));
    expect(list.map((m) => m.slug)).toEqual(["facturation", "stocks", "compta"]);
    expect(list.find((m) => m.slug === "facturation")).toMatchObject({ actif: true, locked: false });
    expect(list.find((m) => m.slug === "stocks")).toMatchObject({ actif: false, locked: false });
    expect(list.find((m) => m.slug === "compta")).toMatchObject({ actif: false, locked: true });
  });

  it("listModules : trial actif → plan entreprise (tous modules déverrouillés)", async () => {
    const repo = new FakeModulesRepository(catalogue);
    const future = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const reader = readerTrialing(A, future);
    const list = await listModules(repo, reader, ctx(A));
    expect(list.every((m) => !m.locked)).toBe(true);
  });

  it("listModules : pas d'abonnement → plan essentiel (modules pro/entreprise verrouillés)", async () => {
    const repo = new FakeModulesRepository(catalogue);
    const reader = new FakeSubscriptionReader();
    const list = await listModules(repo, reader, ctx(A));
    expect(list.find((m) => m.slug === "stocks")?.locked).toBe(true);
    expect(list.find((m) => m.slug === "compta")?.locked).toBe(true);
  });

  it("getOnboardingStatus : défaut si artisan sans statut", async () => {
    const repo = new FakeModulesRepository(catalogue);
    expect(await getOnboardingStatus(repo, ctx(A))).toEqual({ onboardingCompleted: true, metier: null, plan: null });
  });

  it("toggle : module inconnu → NotFoundError", async () => {
    const repo = new FakeModulesRepository(catalogue);
    const reader = readerWithPlan(A, "pro");
    await expect(toggleModule(repo, reader, ctx(A), "inexistant", true)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("toggle : activation d'un module au-dessus du plan réel → ForbiddenError", async () => {
    const repo = new FakeModulesRepository(catalogue);
    const reader = readerWithPlan(A, "starter");
    await expect(toggleModule(repo, reader, ctx(A), "stocks", true)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await toggleModule(repo, reader, ctx(A), "stocks", false)).toEqual({ success: true });
  });

  it("toggle : activation autorisée si le plan réel suffit → persistée", async () => {
    const repo = new FakeModulesRepository(catalogue);
    const reader = readerWithPlan(A, "pro");
    expect(await toggleModule(repo, reader, ctx(A), "stocks", true)).toEqual({ success: true });
    expect(await repo.getSlugsActifs(ctx(A))).toContain("stocks");
  });

  it("completeOnboarding : input.plan ignoré — le gating utilise l'abonnement réel", async () => {
    const repo = new FakeModulesRepository(catalogue);
    const reader = readerWithPlan(A, "starter");
    /** Le client envoie plan="enterprise" : doit être ignoré, modules entreprise restent verrouillés. */
    const inputAvecPlanFalsifie = { metier: "plombier", moduleSlugs: ["facturation", "stocks", "compta"] } as { metier: string; moduleSlugs: string[] };
    await completeOnboarding(repo, reader, ctx(A), inputAvecPlanFalsifie);
    const actifs = await repo.getSlugsActifs(ctx(A));
    expect(actifs.sort()).toEqual(["facturation"]);
    expect(repo.prefsOf(A).has("compta")).toBe(false);
    expect(repo.prefsOf(A).has("stocks")).toBe(false);
  });

  it("completeOnboarding avec moduleSlugs : active les voulus accessibles selon plan réel (pro)", async () => {
    const repo = new FakeModulesRepository(catalogue);
    const reader = readerWithPlan(A, "pro");
    await completeOnboarding(repo, reader, ctx(A), { metier: "plombier", moduleSlugs: ["facturation", "stocks", "compta"] });
    const status = await getOnboardingStatus(repo, ctx(A));
    expect(status).toMatchObject({ onboardingCompleted: true, metier: "plombier" });
    const actifs = await repo.getSlugsActifs(ctx(A));
    expect(actifs.sort()).toEqual(["facturation", "stocks"]);
    expect(repo.prefsOf(A).has("compta")).toBe(false);
  });

  it("completeOnboarding sans moduleSlugs / skipOnboarding : applique les défauts", async () => {
    const repo1 = new FakeModulesRepository(catalogue);
    const reader = readerWithPlan(A, "pro");
    await completeOnboarding(repo1, reader, ctx(A), { metier: "plombier" });
    expect(await repo1.getSlugsActifs(ctx(A))).toEqual(["facturation"]);

    const repo2 = new FakeModulesRepository(catalogue);
    await skipOnboarding(repo2, ctx(A));
    expect((await getOnboardingStatus(repo2, ctx(A))).onboardingCompleted).toBe(true);
    expect(await repo2.getSlugsActifs(ctx(A))).toEqual(["facturation"]);
  });
});

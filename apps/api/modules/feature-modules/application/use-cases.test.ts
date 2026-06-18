import { describe, it, expect } from "vitest";
import { ForbiddenError, NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import { FakeModulesRepository } from "../infra/modules-repository-fake";
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

describe("modules use-cases", () => {
  it("listModules : fallback défauts si aucune préférence, locked selon le plan", async () => {
    const repo = new FakeModulesRepository(catalogue);
    repo.setOnboarding(A, { plan: "pro" });
    const list = await listModules(repo, ctx(A));
    expect(list.map((m) => m.slug)).toEqual(["facturation", "stocks", "compta"]);
    expect(list.find((m) => m.slug === "facturation")).toMatchObject({ actif: true, locked: false }); // défaut actif
    expect(list.find((m) => m.slug === "stocks")).toMatchObject({ actif: false, locked: false }); // pro OK
    expect(list.find((m) => m.slug === "compta")).toMatchObject({ actif: false, locked: true }); // exige entreprise
  });

  it("getOnboardingStatus : défaut si artisan sans statut", async () => {
    const repo = new FakeModulesRepository(catalogue);
    expect(await getOnboardingStatus(repo, ctx(A))).toEqual({ onboardingCompleted: true, metier: null, plan: null });
  });

  it("toggle : module inconnu → NotFoundError", async () => {
    const repo = new FakeModulesRepository(catalogue);
    await expect(toggleModule(repo, ctx(A), "inexistant", true)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("toggle : activation d'un module au-dessus du plan → ForbiddenError", async () => {
    const repo = new FakeModulesRepository(catalogue);
    repo.setOnboarding(A, { plan: "essentiel" });
    await expect(toggleModule(repo, ctx(A), "stocks", true)).rejects.toBeInstanceOf(ForbiddenError);
    // Désactiver un module verrouillé reste permis (pas de garde plan sur actif=false).
    expect(await toggleModule(repo, ctx(A), "stocks", false)).toEqual({ success: true });
  });

  it("toggle : activation autorisée si le plan suffit → persistée", async () => {
    const repo = new FakeModulesRepository(catalogue);
    repo.setOnboarding(A, { plan: "pro" });
    expect(await toggleModule(repo, ctx(A), "stocks", true)).toEqual({ success: true });
    expect(await repo.getSlugsActifs(ctx(A))).toContain("stocks");
  });

  it("completeOnboarding avec moduleSlugs : active les voulus accessibles, ignore ceux au-dessus du plan", async () => {
    const repo = new FakeModulesRepository(catalogue);
    await completeOnboarding(repo, ctx(A), { metier: "plombier", plan: "pro", moduleSlugs: ["facturation", "stocks", "compta"] });
    const status = await getOnboardingStatus(repo, ctx(A));
    expect(status).toMatchObject({ onboardingCompleted: true, metier: "plombier", plan: "pro" });
    const actifs = await repo.getSlugsActifs(ctx(A));
    expect(actifs.sort()).toEqual(["facturation", "stocks"]); // compta exige entreprise → jamais touché
    expect(repo.prefsOf(A).has("compta")).toBe(false);
  });

  it("completeOnboarding sans moduleSlugs / skipOnboarding : applique les défauts", async () => {
    const repo1 = new FakeModulesRepository(catalogue);
    await completeOnboarding(repo1, ctx(A), { plan: "pro" });
    expect(await repo1.getSlugsActifs(ctx(A))).toEqual(["facturation"]);

    const repo2 = new FakeModulesRepository(catalogue);
    await skipOnboarding(repo2, ctx(A));
    expect((await getOnboardingStatus(repo2, ctx(A))).onboardingCompleted).toBe(true);
    expect(await repo2.getSlugsActifs(ctx(A))).toEqual(["facturation"]);
  });
});

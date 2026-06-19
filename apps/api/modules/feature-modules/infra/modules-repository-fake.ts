import type { TenantContext } from "../../../shared/tenant";
import type { IModulesRepository, UpdateOnboardingInput } from "../application/modules-repository";
import type { ModuleCatalogue, OnboardingStatus } from "../domain/module";

type MutableOnboarding = { -readonly [K in keyof OnboardingStatus]: OnboardingStatus[K] };

/*
 * Fake in-memory déterministe (aucun réseau). Catalogue global injecté ; activations + onboarding par
 * tenant. Reproduit le fallback « modules actifs par défaut » quand le tenant n'a aucune préférence.
 */
export class FakeModulesRepository implements IModulesRepository {
  private readonly catalogue: ModuleCatalogue[];
  // artisanId → (slug → actif)
  private readonly prefs = new Map<number, Map<string, boolean>>();
  // artisanId → onboarding
  private readonly onboarding = new Map<number, MutableOnboarding>();

  constructor(catalogue: ModuleCatalogue[] = []) {
    this.catalogue = catalogue;
  }

  setOnboarding(artisanId: number, status: Partial<OnboardingStatus>): void {
    this.onboarding.set(artisanId, {
      onboardingCompleted: status.onboardingCompleted ?? false,
      metier: status.metier ?? null,
      plan: status.plan ?? null,
    });
  }

  prefsOf(artisanId: number): Map<string, boolean> {
    return this.prefs.get(artisanId) ?? new Map();
  }

  async listCatalogue(): Promise<ModuleCatalogue[]> {
    return [...this.catalogue].sort((a, b) => a.ordre - b.ordre || a.id - b.id);
  }

  async getBySlug(slug: string): Promise<ModuleCatalogue | null> {
    return this.catalogue.find((m) => m.slug === slug) ?? null;
  }

  async getSlugsActifs(ctx: TenantContext): Promise<string[]> {
    const p = this.prefs.get(ctx.artisanId);
    if (!p || p.size === 0) {
      return this.catalogue.filter((m) => m.actifParDefaut).map((m) => m.slug);
    }
    return Array.from(p.entries()).filter(([, actif]) => actif).map(([slug]) => slug);
  }

  async getOnboardingStatus(ctx: TenantContext): Promise<OnboardingStatus | null> {
    return this.onboarding.get(ctx.artisanId) ?? null;
  }

  async setModule(ctx: TenantContext, slug: string, actif: boolean): Promise<void> {
    let p = this.prefs.get(ctx.artisanId);
    if (!p) {
      p = new Map();
      this.prefs.set(ctx.artisanId, p);
    }
    p.set(slug, actif);
  }

  async updateOnboarding(ctx: TenantContext, data: UpdateOnboardingInput): Promise<void> {
    const cur = this.onboarding.get(ctx.artisanId) ?? { onboardingCompleted: false, metier: null, plan: null };
    if (data.onboardingCompleted !== undefined) cur.onboardingCompleted = data.onboardingCompleted;
    if (data.metier !== undefined) cur.metier = data.metier;
    if (data.plan !== undefined) cur.plan = data.plan;
    this.onboarding.set(ctx.artisanId, cur);
  }

  async initDefaults(ctx: TenantContext): Promise<void> {
    for (const m of this.catalogue) {
      if (m.actifParDefaut) await this.setModule(ctx, m.slug, true);
    }
  }
}

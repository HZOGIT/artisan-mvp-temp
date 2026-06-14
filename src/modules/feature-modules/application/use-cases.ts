import { ForbiddenError, NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import { enrichirModules, isPlanInsuffisant } from "../domain/plan";
import type { ModuleAvecEtat, OnboardingStatus } from "../domain/module";
import type { IModulesRepository } from "./modules-repository";

// Onboarding par défaut (artisan sans colonnes onboarding / introuvable) — parité legacy.
const DEFAULT_ONBOARDING: OnboardingStatus = { onboardingCompleted: true, metier: null, plan: null };

export interface CompleteOnboardingInput {
  readonly metier?: string;
  readonly plan?: string;
  readonly moduleSlugs?: readonly string[];
}

// Catalogue enrichi de l'état du tenant (actif/locked), trié par ordre du catalogue.
export async function listModules(repo: IModulesRepository, ctx: TenantContext): Promise<ModuleAvecEtat[]> {
  const [catalogue, slugsActifs, status] = await Promise.all([
    repo.listCatalogue(),
    repo.getSlugsActifs(ctx),
    repo.getOnboardingStatus(ctx),
  ]);
  return enrichirModules(catalogue, slugsActifs, status?.plan ?? "essentiel");
}

export function getMine(repo: IModulesRepository, ctx: TenantContext): Promise<string[]> {
  return repo.getSlugsActifs(ctx);
}

export async function getOnboardingStatus(repo: IModulesRepository, ctx: TenantContext): Promise<OnboardingStatus> {
  return (await repo.getOnboardingStatus(ctx)) ?? DEFAULT_ONBOARDING;
}

// Active/désactive un module : module connu (sinon 404), et activation interdite si le plan du tenant
// est insuffisant (403 — parité legacy « Passez au plan supérieur »).
export async function toggleModule(repo: IModulesRepository, ctx: TenantContext, slug: string, actif: boolean): Promise<{ success: true }> {
  const module = await repo.getBySlug(slug);
  if (!module) throw new NotFoundError("Module inconnu");
  if (actif) {
    const status = await repo.getOnboardingStatus(ctx);
    if (isPlanInsuffisant(module.planMinimum, status?.plan)) {
      throw new ForbiddenError("Passez au plan supérieur pour activer ce module");
    }
  }
  await repo.setModule(ctx, slug, actif);
  return { success: true };
}

// Termine l'onboarding : enregistre completed/metier/plan, puis applique la sélection de modules
// (chaque module accessible au plan est activé/désactivé selon `moduleSlugs`) ou les défauts.
export async function completeOnboarding(repo: IModulesRepository, ctx: TenantContext, input: CompleteOnboardingInput): Promise<{ success: true }> {
  await repo.updateOnboarding(ctx, { onboardingCompleted: true, metier: input.metier, plan: input.plan });
  if (input.moduleSlugs) {
    const wanted = new Set(input.moduleSlugs);
    const catalogue = await repo.listCatalogue();
    const planArtisan = input.plan ?? "essentiel";
    for (const m of catalogue) {
      if (isPlanInsuffisant(m.planMinimum, planArtisan)) continue;
      await repo.setModule(ctx, m.slug, wanted.has(m.slug));
    }
  } else {
    await repo.initDefaults(ctx);
  }
  return { success: true };
}

// Passe l'onboarding : marque terminé et active les modules par défaut.
export async function skipOnboarding(repo: IModulesRepository, ctx: TenantContext): Promise<{ success: true }> {
  await repo.updateOnboarding(ctx, { onboardingCompleted: true });
  await repo.initDefaults(ctx);
  return { success: true };
}

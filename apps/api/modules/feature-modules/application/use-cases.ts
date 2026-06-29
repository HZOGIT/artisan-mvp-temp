import { ForbiddenError, NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { ISubscriptionReader } from "../../subscription/application/subscription-reader";
import { enrichirModules, isPlanInsuffisant, resolveGatingPlan } from "../domain/plan";
import type { ModuleAvecEtat, OnboardingStatus } from "../domain/module";
import type { IModulesRepository } from "./modules-repository";

/**
 * Garde plan centralisée : vérifie que le plan actif de l'artisan est suffisant pour le module
 * identifié par `moduleSlug`. Lève `ForbiddenError` si insuffisant. No-op si le module est inconnu.
 */
export async function assertPlanModule(
  subscriptionReader: ISubscriptionReader,
  modulesRepo: IModulesRepository,
  ctx: TenantContext,
  moduleSlug: string,
): Promise<void> {
  const [mod, sub] = await Promise.all([
    modulesRepo.getBySlug(moduleSlug),
    subscriptionReader.getSubscription(ctx),
  ]);
  if (mod && isPlanInsuffisant(mod.planMinimum, resolveGatingPlan(sub))) {
    throw new ForbiddenError("Passez au plan supérieur pour accéder à cette fonctionnalité");
  }
}

/** Onboarding par défaut (artisan sans colonnes onboarding / introuvable) — parité legacy. */
const DEFAULT_ONBOARDING: OnboardingStatus = { onboardingCompleted: true, metier: null, plan: null };

export interface CompleteOnboardingInput {
  readonly metier?: string;
  readonly moduleSlugs?: readonly string[];
}

/** Catalogue enrichi de l'état du tenant (actif/locked), trié par ordre du catalogue. */
export async function listModules(repo: IModulesRepository, subscriptionReader: ISubscriptionReader, ctx: TenantContext): Promise<ModuleAvecEtat[]> {
  const [catalogue, slugsActifs, sub] = await Promise.all([
    repo.listCatalogue(),
    repo.getSlugsActifs(ctx),
    subscriptionReader.getSubscription(ctx),
  ]);
  return enrichirModules(catalogue, slugsActifs, resolveGatingPlan(sub));
}

export function getMine(repo: IModulesRepository, ctx: TenantContext): Promise<string[]> {
  return repo.getSlugsActifs(ctx);
}

export async function getOnboardingStatus(repo: IModulesRepository, ctx: TenantContext): Promise<OnboardingStatus> {
  return (await repo.getOnboardingStatus(ctx)) ?? DEFAULT_ONBOARDING;
}

/*
 * Active/désactive un module : module connu (sinon 404), et activation interdite si le plan réel du tenant
 * (billing_subscriptions) est insuffisant (403 — parité legacy « Passez au plan supérieur »).
 */
export async function toggleModule(repo: IModulesRepository, subscriptionReader: ISubscriptionReader, ctx: TenantContext, slug: string, actif: boolean): Promise<{ success: true }> {
  const module = await repo.getBySlug(slug);
  if (!module) throw new NotFoundError("Module inconnu");
  if (actif) {
    const sub = await subscriptionReader.getSubscription(ctx);
    if (isPlanInsuffisant(module.planMinimum, resolveGatingPlan(sub))) {
      throw new ForbiddenError("Passez au plan supérieur pour activer ce module");
    }
  }
  await repo.setModule(ctx, slug, actif);
  return { success: true };
}

/*
 * Termine l'onboarding : enregistre completed/metier, puis applique la sélection de modules selon
 * le plan RÉEL de l'abonnement (billing_subscriptions). `input.plan` est ignoré — le client ne peut
 * pas auto-déclarer son plan de gating.
 */
export async function completeOnboarding(repo: IModulesRepository, subscriptionReader: ISubscriptionReader, ctx: TenantContext, input: CompleteOnboardingInput): Promise<{ success: true }> {
  await repo.updateOnboarding(ctx, { onboardingCompleted: true, metier: input.metier });
  if (input.moduleSlugs) {
    const wanted = new Set(input.moduleSlugs);
    const [catalogue, sub] = await Promise.all([repo.listCatalogue(), subscriptionReader.getSubscription(ctx)]);
    const planArtisan = resolveGatingPlan(sub);
    for (const m of catalogue) {
      if (isPlanInsuffisant(m.planMinimum, planArtisan)) continue;
      await repo.setModule(ctx, m.slug, wanted.has(m.slug));
    }
  } else {
    await repo.initDefaults(ctx);
  }
  return { success: true };
}

/** Passe l'onboarding : marque terminé et active les modules par défaut. */
export async function skipOnboarding(repo: IModulesRepository, ctx: TenantContext): Promise<{ success: true }> {
  await repo.updateOnboarding(ctx, { onboardingCompleted: true });
  await repo.initDefaults(ctx);
  return { success: true };
}

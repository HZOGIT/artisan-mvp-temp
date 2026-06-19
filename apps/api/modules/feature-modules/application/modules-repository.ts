import type { TenantContext } from "../../../shared/tenant";
import type { ModuleCatalogue, OnboardingStatus } from "../domain/module";

/** Champs d'onboarding modifiables (set partiel : seuls les champs fournis sont mis à jour). */
export interface UpdateOnboardingInput {
  readonly onboardingCompleted?: boolean;
  readonly metier?: string;
  readonly plan?: string;
}

/*
 * Port du repository « modules ». Le catalogue (`listCatalogue`/`getBySlug`) est GLOBAL (hors tenant) ;
 * les activations (`getSlugsActifs`/`setModule`/`initDefaults`) sont scopées au tenant (table
 * `artisan_modules` sous RLS) ; l'onboarding est porté par la table d'identité `artisans` (scope par id).
 */
export interface IModulesRepository {
  /** Catalogue global trié par `ordre`. */
  listCatalogue(): Promise<ModuleCatalogue[]>;
  /** Une entrée du catalogue par slug (null si inconnue). */
  getBySlug(slug: string): Promise<ModuleCatalogue | null>;
  /** Slugs des modules actifs du tenant ; fallback sur les modules `actifParDefaut` si aucune préférence. */
  getSlugsActifs(ctx: TenantContext): Promise<string[]>;
  /** État d'onboarding du tenant (null si artisan introuvable). */
  getOnboardingStatus(ctx: TenantContext): Promise<OnboardingStatus | null>;
  /** Active/désactive un module pour le tenant (upsert sur (artisan_id, module_slug)). */
  setModule(ctx: TenantContext, slug: string, actif: boolean): Promise<void>;
  /** Met à jour les champs d'onboarding du tenant. */
  updateOnboarding(ctx: TenantContext, data: UpdateOnboardingInput): Promise<void>;
  /** Initialise les préférences : active tous les modules `actifParDefaut` (idempotent). */
  initDefaults(ctx: TenantContext): Promise<void>;
}

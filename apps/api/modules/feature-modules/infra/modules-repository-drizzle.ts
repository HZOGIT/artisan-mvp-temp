import { asc, eq } from "drizzle-orm";
import { artisanModules, artisans, modules } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IModulesRepository, UpdateOnboardingInput } from "../application/modules-repository";
import type { ModuleCatalogue, OnboardingStatus } from "../domain/module";

type CatRow = typeof modules.$inferSelect;

function toCatalogue(r: CatRow): ModuleCatalogue {
  return {
    id: r.id,
    slug: r.slug,
    label: r.label,
    description: r.description ?? null,
    icon: r.icon,
    categorie: r.categorie,
    planMinimum: r.plan_minimum,
    actifParDefaut: r.actif_par_defaut,
    ordre: r.ordre,
  };
}

/*
 * Implémentation Drizzle des modules. Le catalogue `modules` est GLOBAL (aucune colonne tenant, hors
 * RLS) ; `artisan_modules` porte `artisan_id` (sous RLS) → les activations passent par `withTenant`
 * (double cloisonnement RLS + filtre explicite). L'onboarding vit sur `artisans` (table d'identité hors
 * RLS) → scope par `id = ctx.artisanId` (jamais un userId arbitraire).
 */
export class ModulesRepositoryDrizzle implements IModulesRepository {
  constructor(private readonly db: DbClient) {}

  async listCatalogue(): Promise<ModuleCatalogue[]> {
    const rows = await this.db.select().from(modules).orderBy(asc(modules.ordre), asc(modules.id));
    return rows.map(toCatalogue);
  }

  async getBySlug(slug: string): Promise<ModuleCatalogue | null> {
    const [row] = await this.db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
    return row ? toCatalogue(row) : null;
  }

  async getSlugsActifs(ctx: TenantContext): Promise<string[]> {
    return withTenant(this.db, ctx, async (tx) => {
      const prefs = await tx
        .select({ slug: artisanModules.module_slug, actif: artisanModules.actif })
        .from(artisanModules)
        .where(eq(artisanModules.artisan_id, ctx.artisanId));
      // Aucune préférence → fallback sur les modules actifs par défaut (parité legacy).
      if (prefs.length === 0) {
        const defaults = await tx.select({ slug: modules.slug }).from(modules).where(eq(modules.actif_par_defaut, true));
        return defaults.map((r) => r.slug);
      }
      return prefs.filter((r) => r.actif).map((r) => r.slug);
    });
  }

  async getOnboardingStatus(ctx: TenantContext): Promise<OnboardingStatus | null> {
    const [row] = await this.db
      .select({ onboardingCompleted: artisans.onboardingCompleted, metier: artisans.metier, plan: artisans.plan })
      .from(artisans)
      .where(eq(artisans.id, ctx.artisanId))
      .limit(1);
    if (!row) return null;
    return {
      onboardingCompleted: row.onboardingCompleted === true,
      metier: row.metier ?? null,
      plan: row.plan ?? null,
    };
  }

  async setModule(ctx: TenantContext, slug: string, actif: boolean): Promise<void> {
    await withTenant(this.db, ctx, async (tx) => {
      await tx
        .insert(artisanModules)
        .values({ artisan_id: ctx.artisanId, module_slug: slug, actif })
        .onConflictDoUpdate({ target: [artisanModules.artisan_id, artisanModules.module_slug], set: { actif } });
    });
  }

  async updateOnboarding(ctx: TenantContext, data: UpdateOnboardingInput): Promise<void> {
    const set: Partial<typeof artisans.$inferInsert> = {};
    if (data.onboardingCompleted !== undefined) set.onboardingCompleted = data.onboardingCompleted;
    if (data.metier !== undefined) set.metier = data.metier;
    if (data.plan !== undefined) set.plan = data.plan;
    if (Object.keys(set).length === 0) return;
    await this.db.update(artisans).set(set).where(eq(artisans.id, ctx.artisanId));
  }

  async initDefaults(ctx: TenantContext): Promise<void> {
    await withTenant(this.db, ctx, async (tx) => {
      const defaults = await tx.select({ slug: modules.slug }).from(modules).where(eq(modules.actif_par_defaut, true));
      for (const m of defaults) {
        await tx
          .insert(artisanModules)
          .values({ artisan_id: ctx.artisanId, module_slug: m.slug, actif: true })
          .onConflictDoUpdate({ target: [artisanModules.artisan_id, artisanModules.module_slug], set: { actif: true } });
      }
    });
  }
}

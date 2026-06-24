import { and, eq, ne } from "drizzle-orm";
import { artisans } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IArtisanRepository } from "../application/artisan-repository";
import type { ArtisanProfile, UpdateArtisanProfileInput } from "../domain/artisan";

type Row = typeof artisans.$inferSelect;

function toProfile(r: Row): ArtisanProfile {
  return {
    id: r.id,
    userId: r.userId ?? null,
    siret: r.siret ?? null,
    nomEntreprise: r.nomEntreprise ?? null,
    adresse: r.adresse ?? null,
    codePostal: r.codePostal ?? null,
    ville: r.ville ?? null,
    telephone: r.telephone ?? null,
    email: r.email ?? null,
    specialite: r.specialite ?? null,
    tauxTVA: r.tauxTVA ?? null,
    numeroTVA: r.numeroTVA ?? null,
    iban: r.iban ?? null,
    codeAPE: r.codeAPE ?? null,
    formeJuridique: r.formeJuridique ?? null,
    capitalSocial: r.capitalSocial ?? null,
    villeRCS: r.villeRCS ?? null,
    numeroRM: r.numeroRM ?? null,
    logo: r.logo ?? null,
    slug: r.slug ?? null,
    metier: r.metier ?? null,
    plan: r.plan ?? null,
    onboardingCompleted: r.onboardingCompleted ?? null,
    franchiseTVA: r.franchiseTVA ?? false,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/*
 * ⚠️ `artisans` est la table d'IDENTITÉ (hors RLS tenant) : le scope est porté par `id = ctx.artisanId`
 * (jamais par un `userId` arbitraire). app_tenant a les droits SELECT/UPDATE sur cette table.
 */
export class ArtisanRepositoryDrizzle implements IArtisanRepository {
  constructor(private readonly db: DbClient) {}

  async getProfile(ctx: TenantContext): Promise<ArtisanProfile | null> {
    const [row] = await this.db.select().from(artisans).where(eq(artisans.id, ctx.artisanId)).limit(1);
    return row ? toProfile(row) : null;
  }

  async update(ctx: TenantContext, input: UpdateArtisanProfileInput): Promise<ArtisanProfile | null> {
    const set: Partial<typeof artisans.$inferInsert> = { updatedAt: new Date() };
    const cols: (keyof UpdateArtisanProfileInput)[] = [
      "siret", "nomEntreprise", "adresse", "codePostal", "ville", "telephone", "email", "specialite",
      "tauxTVA", "numeroTVA", "iban", "codeAPE", "formeJuridique", "capitalSocial", "villeRCS",
      "numeroRM", "logo", "slug", "metier", "franchiseTVA",
    ];
    for (const c of cols) {
      if (input[c] !== undefined) (set as Record<string, unknown>)[c] = input[c];
    }
    const [row] = await this.db.update(artisans).set(set).where(eq(artisans.id, ctx.artisanId)).returning();
    return row ? toProfile(row) : null;
  }

  async isSlugAvailable(ctx: TenantContext, slug: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: artisans.id })
      .from(artisans)
      .where(and(eq(artisans.slug, slug), ne(artisans.id, ctx.artisanId)))
      .limit(1);
    return !row;
  }
}

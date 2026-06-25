import type { TenantContext } from "../../../shared/tenant";
import type { IArtisanRepository } from "../application/artisan-repository";
import type { ArtisanProfile, UpdateArtisanProfileInput } from "../domain/artisan";

/*
 * Double in-memory du repository « profil artisan » (tests sans DB). Le profil est scopé par
 * `id = ctx.artisanId`. `seed` injecte un profil ; `isSlugAvailable` exclut le sien.
 */
export class FakeArtisanRepository implements IArtisanRepository {
  private profiles: ArtisanProfile[] = [];

  seed(over: Partial<ArtisanProfile> & { id: number }): ArtisanProfile {
    const now = new Date();
    const p: ArtisanProfile = {
      userId: null, siret: null, nomEntreprise: null, adresse: null, codePostal: null, ville: null,
      telephone: null, email: null, specialite: null, tauxTVA: null, numeroTVA: null, iban: null,
      codeAPE: null, formeJuridique: null, capitalSocial: null, villeRCS: null, numeroRM: null,
      logo: null, slug: null, metier: null, plan: null, onboardingCompleted: null, franchiseTVA: false,
      assuranceDecennaleNom: null, assuranceDecennalePolice: null, assuranceDecennaleGarantie: null,
      createdAt: now, updatedAt: now, ...over,
    };
    this.profiles = this.profiles.filter((x) => x.id !== p.id).concat(p);
    return p;
  }

  async getProfile(ctx: TenantContext): Promise<ArtisanProfile | null> {
    return this.profiles.find((p) => p.id === ctx.artisanId) ?? null;
  }

  async update(ctx: TenantContext, input: UpdateArtisanProfileInput): Promise<ArtisanProfile | null> {
    const idx = this.profiles.findIndex((p) => p.id === ctx.artisanId);
    if (idx === -1) return null;
    const cur = this.profiles[idx];
    const patch: Partial<ArtisanProfile> = {};
    for (const [k, v] of Object.entries(input)) {
      if (v !== undefined) (patch as Record<string, unknown>)[k] = v;
    }
    const next = { ...cur, ...patch, updatedAt: new Date() };
    this.profiles[idx] = next;
    return next;
  }

  async isSlugAvailable(ctx: TenantContext, slug: string): Promise<boolean> {
    return !this.profiles.some((p) => p.slug === slug && p.id !== ctx.artisanId);
  }
}

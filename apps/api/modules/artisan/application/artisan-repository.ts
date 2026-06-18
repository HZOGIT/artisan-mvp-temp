import type { TenantContext } from "../../../shared/tenant";
import type { ArtisanProfile, UpdateArtisanProfileInput } from "../domain/artisan";

// Port du repository « profil artisan ». Toujours scopé au tenant courant (`ctx.artisanId`) : le
// profil EST le tenant (table d'identité `artisans`, hors RLS). Aucune opération cross-tenant.
export interface IArtisanRepository {
  // Profil du tenant courant ; null si introuvable (ne devrait pas arriver pour un tenant résolu).
  getProfile(ctx: TenantContext): Promise<ArtisanProfile | null>;
  // Met à jour le profil du tenant courant (champs fournis seulement). null si introuvable.
  update(ctx: TenantContext, input: UpdateArtisanProfileInput): Promise<ArtisanProfile | null>;
  // true si le slug est libre (ou déjà le sien). Garde d'unicité du slug public (vitrine/portail).
  isSlugAvailable(ctx: TenantContext, slug: string): Promise<boolean>;
}

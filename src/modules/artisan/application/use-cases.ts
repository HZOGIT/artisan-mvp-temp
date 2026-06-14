import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import { isValidIban, normalizeSlug } from "../../../shared/validation/iban";
import type { IArtisanRepository } from "./artisan-repository";
import type { ArtisanProfile, UpdateArtisanProfileInput } from "../domain/artisan";

// Profil du tenant courant. null possible si l'artisan n'a pas encore de profil (parité legacy :
// renvoie l'enregistrement ou null, PAS une 404).
export function getProfile(repo: IArtisanRepository, ctx: TenantContext): Promise<ArtisanProfile | null> {
  return repo.getProfile(ctx);
}

// Met à jour le profil du tenant : valide l'IBAN (clé MOD-97), normalise le `slug` + vérifie son
// unicité (ConflictError), puis applique. Parité legacy `artisan.updateProfile`.
export async function updateProfile(repo: IArtisanRepository, ctx: TenantContext, input: UpdateArtisanProfileInput): Promise<ArtisanProfile> {
  if (input.iban !== undefined && input.iban !== null && !isValidIban(input.iban)) {
    throw new ValidationError("IBAN invalide (format ou clé de contrôle)");
  }
  const patch: { -readonly [K in keyof UpdateArtisanProfileInput]: UpdateArtisanProfileInput[K] } = { ...input };
  if (input.slug !== undefined && input.slug !== null) {
    const slug = normalizeSlug(input.slug);
    if (!slug) throw new ValidationError("Slug invalide");
    if (!(await repo.isSlugAvailable(ctx, slug))) throw new ConflictError("Ce slug est déjà utilisé");
    patch.slug = slug;
  }
  if (input.metier !== undefined && input.metier !== null) {
    patch.metier = input.metier.trim() || null;
  }
  const updated = await repo.update(ctx, patch);
  if (!updated) throw new NotFoundError("Profil artisan introuvable");
  return updated;
}

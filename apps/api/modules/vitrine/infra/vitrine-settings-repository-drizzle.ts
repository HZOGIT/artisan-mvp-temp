import { eq } from "drizzle-orm";
import { parametresArtisan } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IVitrineSettingsRepository } from "../application/vitrine-settings-repository";
import { DEFAULT_VITRINE_SETTINGS, type VitrineSettings, type UpdateVitrineSettingsInput } from "../domain/vitrine-settings";

type ParametresRow = typeof parametresArtisan.$inferSelect;
type ParametresInsert = typeof parametresArtisan.$inferInsert;

function toSettings(r: ParametresRow): VitrineSettings {
  return {
    vitrineActive: r.vitrineActive ?? false,
    vitrineDescription: r.vitrineDescription ?? null,
    vitrineZone: r.vitrineZone ?? null,
    vitrineServices: r.vitrineServices ?? null,
    vitrineExperience: r.vitrineExperience ?? null,
  };
}

/** Ne retient que les champs vitrine réellement fournis (les autres colonnes restent inchangées). */
function toSet(input: UpdateVitrineSettingsInput): Partial<ParametresInsert> {
  const set: Partial<ParametresInsert> = {};
  if (input.vitrineActive !== undefined) set.vitrineActive = input.vitrineActive;
  if (input.vitrineDescription !== undefined) set.vitrineDescription = input.vitrineDescription;
  if (input.vitrineZone !== undefined) set.vitrineZone = input.vitrineZone;
  if (input.vitrineServices !== undefined) set.vitrineServices = input.vitrineServices;
  if (input.vitrineExperience !== undefined) set.vitrineExperience = input.vitrineExperience;
  return set;
}

/*
 * Implémentation Drizzle des réglages vitrine (colonnes `vitrine*` de `parametres_artisan`, singleton
 * par tenant). Double cloisonnement RLS + filtre `artisanId`. Même pattern d'upsert idempotent que
 * `ParametresRepositoryDrizzle` (crée la ligne si absente, sinon met à jour les seuls champs fournis).
 */
export class VitrineSettingsRepositoryDrizzle implements IVitrineSettingsRepository {
  constructor(private readonly db: DbClient) {}

  get(ctx: TenantContext): Promise<VitrineSettings> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(parametresArtisan)
        .where(eq(parametresArtisan.artisanId, ctx.artisanId))
        .limit(1);
      return row ? toSettings(row) : DEFAULT_VITRINE_SETTINGS;
    });
  }

  update(ctx: TenantContext, input: UpdateVitrineSettingsInput): Promise<VitrineSettings> {
    return withTenant(this.db, ctx, async (tx) => {
      const set = toSet(input);
      const ins = tx.insert(parametresArtisan).values({ artisanId: ctx.artisanId, ...set });
      await (Object.keys(set).length === 0
        ? ins.onConflictDoNothing({ target: parametresArtisan.artisanId })
        : ins.onConflictDoUpdate({ target: parametresArtisan.artisanId, set }));
      const [row] = await tx
        .select()
        .from(parametresArtisan)
        .where(eq(parametresArtisan.artisanId, ctx.artisanId))
        .limit(1);
      return toSettings(row);
    });
  }
}

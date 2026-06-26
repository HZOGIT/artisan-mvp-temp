import { eq } from "drizzle-orm";
import { configRelancesAuto } from "../../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import { withTenant } from "../../../shared/db";
import type { TenantContext } from "../../../shared/tenant";
import type { IConfigRelancesRepository } from "../application/config-relances-repository";
import { defaultConfigRelances } from "../domain/config-relances";
import type { ConfigRelancesAuto, UpdateConfigRelancesInput } from "../domain/config-relances";

type ConfigRow = typeof configRelancesAuto.$inferSelect;
type ConfigInsert = typeof configRelancesAuto.$inferInsert;

/** socle de défauts (artisanId remplacé au mapping) */
const D = defaultConfigRelances(0);

function toConfig(r: ConfigRow): ConfigRelancesAuto {
  return {
    artisanId: r.artisanId,
    actif: r.actif ?? D.actif,
    joursApresEnvoi: r.joursApresEnvoi ?? D.joursApresEnvoi,
    joursEntreRelances: r.joursEntreRelances ?? D.joursEntreRelances,
    nombreMaxRelances: r.nombreMaxRelances ?? D.nombreMaxRelances,
    heureEnvoi: r.heureEnvoi ?? D.heureEnvoi,
    joursEnvoi: r.joursEnvoi ?? D.joursEnvoi,
    modeleEmailId: r.modeleEmailId ?? null,
  };
}

/** Ne retient que les champs config réellement fournis (les autres restent inchangés). */
function toConfigSet(input: UpdateConfigRelancesInput): Partial<ConfigInsert> {
  const set: Partial<ConfigInsert> = {};
  if (input.actif !== undefined) set.actif = input.actif;
  if (input.joursApresEnvoi !== undefined) set.joursApresEnvoi = input.joursApresEnvoi;
  if (input.joursEntreRelances !== undefined) set.joursEntreRelances = input.joursEntreRelances;
  if (input.nombreMaxRelances !== undefined) set.nombreMaxRelances = input.nombreMaxRelances;
  if (input.heureEnvoi !== undefined) set.heureEnvoi = input.heureEnvoi;
  if (input.joursEnvoi !== undefined) set.joursEnvoi = input.joursEnvoi;
  if (input.modeleEmailId !== undefined) set.modeleEmailId = input.modeleEmailId;
  return set;
}

/*
 * Implémentation Drizzle du repository config-relances (singleton par tenant). Double cloisonnement
 * RLS + filtre `artisanId` sur `config_relances_auto` (artisanId UNIQUE).
 */
export class ConfigRelancesRepositoryDrizzle implements IConfigRelancesRepository {
  constructor(private readonly db: DbClient) {}

  get(ctx: TenantContext): Promise<ConfigRelancesAuto> {
    return withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select()
        .from(configRelancesAuto)
        .where(eq(configRelancesAuto.artisanId, ctx.artisanId))
        .limit(1);
      return row ? toConfig(row) : defaultConfigRelances(ctx.artisanId);
    });
  }

  withDb(db: DbClient): ConfigRelancesRepositoryDrizzle {
    return new ConfigRelancesRepositoryDrizzle(db);
  }

  upsert(ctx: TenantContext, input: UpdateConfigRelancesInput): Promise<ConfigRelancesAuto> {
    return withTenant(this.db, ctx, async (tx) => {
      const set = toConfigSet(input);
      /*
       * Singleton idempotent : crée la ligne du tenant si absente, sinon met à jour les seuls champs
       * config fournis. `artisanId` forcé au tenant. Input vide → garantit l'existence (DO NOTHING).
       */
      const ins = tx.insert(configRelancesAuto).values({ artisanId: ctx.artisanId, ...set });
      await (Object.keys(set).length === 0
        ? ins.onConflictDoNothing({ target: configRelancesAuto.artisanId })
        : ins.onConflictDoUpdate({ target: configRelancesAuto.artisanId, set }));
      const [row] = await tx
        .select()
        .from(configRelancesAuto)
        .where(eq(configRelancesAuto.artisanId, ctx.artisanId))
        .limit(1);
      return toConfig(row);
    });
  }
}

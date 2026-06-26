import type { TenantContext } from "../../../shared/tenant";
import type { IConfigRelancesRepository } from "../application/config-relances-repository";
import { defaultConfigRelances } from "../domain/config-relances";
import type { ConfigRelancesAuto, UpdateConfigRelancesInput } from "../domain/config-relances";

/*
 * Implémentation in-memory du repository config-relances (tests sans DB). Reproduit les invariants
 * du repo Drizzle : singleton par artisanId, défauts si absent (jamais null), upsert qui fusionne les
 * champs config fournis, `artisanId` forcé au tenant.
 */
export class FakeConfigRelancesRepository implements IConfigRelancesRepository {
  private readonly store = new Map<number, ConfigRelancesAuto>();

  /* ponytail: withDb ignoré — fake in-memory, pas de transaction réelle */
  withDb(_db: unknown): FakeConfigRelancesRepository {
    return this;
  }

  async get(ctx: TenantContext): Promise<ConfigRelancesAuto> {
    return this.store.get(ctx.artisanId) ?? defaultConfigRelances(ctx.artisanId);
  }

  async upsert(ctx: TenantContext, input: UpdateConfigRelancesInput): Promise<ConfigRelancesAuto> {
    const current = this.store.get(ctx.artisanId) ?? defaultConfigRelances(ctx.artisanId);
    const next: ConfigRelancesAuto = {
      ...current,
      artisanId: ctx.artisanId,
      ...(input.actif !== undefined ? { actif: input.actif } : {}),
      ...(input.joursApresEnvoi !== undefined ? { joursApresEnvoi: input.joursApresEnvoi } : {}),
      ...(input.joursEntreRelances !== undefined ? { joursEntreRelances: input.joursEntreRelances } : {}),
      ...(input.nombreMaxRelances !== undefined ? { nombreMaxRelances: input.nombreMaxRelances } : {}),
      ...(input.heureEnvoi !== undefined ? { heureEnvoi: input.heureEnvoi } : {}),
      ...(input.joursEnvoi !== undefined ? { joursEnvoi: input.joursEnvoi } : {}),
      ...(input.modeleEmailId !== undefined ? { modeleEmailId: input.modeleEmailId } : {}),
    };
    this.store.set(ctx.artisanId, next);
    return next;
  }
}

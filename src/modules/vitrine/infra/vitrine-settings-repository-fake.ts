import type { TenantContext } from "../../../shared/tenant";
import type { IVitrineSettingsRepository } from "../application/vitrine-settings-repository";
import { DEFAULT_VITRINE_SETTINGS, type VitrineSettings, type UpdateVitrineSettingsInput } from "../domain/vitrine-settings";

// Fake en mémoire (tests use-case) : singleton par artisanId, upsert partiel idempotent.
export class VitrineSettingsRepositoryFake implements IVitrineSettingsRepository {
  private readonly byArtisan = new Map<number, VitrineSettings>();

  async get(ctx: TenantContext): Promise<VitrineSettings> {
    return this.byArtisan.get(ctx.artisanId) ?? DEFAULT_VITRINE_SETTINGS;
  }

  async update(ctx: TenantContext, input: UpdateVitrineSettingsInput): Promise<VitrineSettings> {
    const current = this.byArtisan.get(ctx.artisanId) ?? DEFAULT_VITRINE_SETTINGS;
    const next: VitrineSettings = {
      vitrineActive: input.vitrineActive ?? current.vitrineActive,
      vitrineDescription: input.vitrineDescription !== undefined ? input.vitrineDescription : current.vitrineDescription,
      vitrineZone: input.vitrineZone !== undefined ? input.vitrineZone : current.vitrineZone,
      vitrineServices: input.vitrineServices !== undefined ? input.vitrineServices : current.vitrineServices,
      vitrineExperience: input.vitrineExperience !== undefined ? input.vitrineExperience : current.vitrineExperience,
    };
    this.byArtisan.set(ctx.artisanId, next);
    return next;
  }
}

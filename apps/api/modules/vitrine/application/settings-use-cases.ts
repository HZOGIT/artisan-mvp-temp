import type { TenantContext } from "../../../shared/tenant";
import type { VitrineSettings, UpdateVitrineSettingsInput } from "../domain/vitrine-settings";
import type { IVitrineSettingsRepository } from "./vitrine-settings-repository";

// Use-cases ADMIN des réglages vitrine. Transport mince : délègue au repo scopé tenant.
export function getVitrineSettings(repo: IVitrineSettingsRepository, ctx: TenantContext): Promise<VitrineSettings> {
  return repo.get(ctx);
}

export function updateVitrineSettings(
  repo: IVitrineSettingsRepository,
  ctx: TenantContext,
  input: UpdateVitrineSettingsInput,
): Promise<VitrineSettings> {
  return repo.update(ctx, input);
}

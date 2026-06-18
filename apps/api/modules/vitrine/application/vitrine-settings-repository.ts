import type { TenantContext } from "../../../shared/tenant";
import type { VitrineSettings, UpdateVitrineSettingsInput } from "../domain/vitrine-settings";

// Port (repository) des réglages vitrine, scopé tenant (RLS + filtre artisanId sur `parametres_artisan`,
// singleton). `get` renvoie toujours un objet lisible (défauts si la ligne n'existe pas encore).
export interface IVitrineSettingsRepository {
  get(ctx: TenantContext): Promise<VitrineSettings>;
  update(ctx: TenantContext, input: UpdateVitrineSettingsInput): Promise<VitrineSettings>;
}

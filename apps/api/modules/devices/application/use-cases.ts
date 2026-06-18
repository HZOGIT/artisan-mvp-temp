import type { TenantContext } from "../../../shared/tenant";
import type { IDeviceRepository } from "./device-repository";
import type { Device } from "../domain/device";
import { generateFingerprint } from "../domain/device";

// Gestion des appareils/sessions de l'utilisateur courant (parité legacy `devices`). Toujours scopé
// par `ctx.userId` (table HORS RLS) → un utilisateur ne gère QUE ses propres appareils.

export function listDevices(repo: IDeviceRepository, ctx: TenantContext): Promise<Device[]> {
  return repo.listByUser(ctx.userId);
}

export async function revokeDevice(repo: IDeviceRepository, ctx: TenantContext, deviceId: number): Promise<{ success: true }> {
  await repo.deleteOwned(deviceId, ctx.userId);
  return { success: true };
}

// Déconnecte tous les AUTRES appareils : on dérive l'empreinte de l'appareil courant depuis le
// User-Agent de la requête (parité legacy — le serveur ne connaît pas autrement « l'appareil courant »).
export async function revokeOtherDevices(repo: IDeviceRepository, ctx: TenantContext, userAgent: string): Promise<{ success: true; removed: number }> {
  const currentFingerprint = generateFingerprint(userAgent);
  const removed = await repo.deleteOthers(ctx.userId, currentFingerprint);
  return { success: true, removed };
}

import type { Device } from "../domain/device";

/*
 * Port du repository `devices`. Table HORS RLS → scoping EXPLICITE par `userId` dans chaque méthode
 * (anti-IDOR : un utilisateur ne voit/ne supprime QUE ses propres appareils). Parité legacy.
 */
export interface IDeviceRepository {
  /** Appareils de l'utilisateur, plus récemment actifs d'abord. */
  listByUser(userId: number): Promise<Device[]>;
  /** Supprime un appareil SI il appartient à l'utilisateur (no-op sinon — anti-IDOR). */
  deleteOwned(deviceId: number, userId: number): Promise<void>;
  /** Supprime tous les appareils de l'utilisateur SAUF celui de l'empreinte courante → nb supprimés. */
  deleteOthers(userId: number, currentFingerprint: string): Promise<number>;
}

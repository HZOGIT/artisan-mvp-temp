import type { IDeviceRepository } from "../application/device-repository";
import type { Device } from "../domain/device";

interface StoredDevice extends Device {
  readonly userId: number;
}

/** Fake en mémoire du repository `devices` (scope explicite par userId, parité de l'isolation). */
export class DeviceRepositoryFake implements IDeviceRepository {
  private rows: StoredDevice[];
  constructor(seed: StoredDevice[] = []) {
    this.rows = [...seed];
  }

  async listByUser(userId: number): Promise<Device[]> {
    return this.rows
      .filter((d) => d.userId === userId)
      .sort((a, b) => (b.lastActiveAt?.getTime() ?? 0) - (a.lastActiveAt?.getTime() ?? 0))
      .map(({ userId: _u, ...d }) => d);
  }

  async deleteOwned(deviceId: number, userId: number): Promise<void> {
    this.rows = this.rows.filter((d) => !(d.id === deviceId && d.userId === userId));
  }

  async deleteOthers(userId: number, currentFingerprint: string): Promise<number> {
    const before = this.rows.length;
    this.rows = this.rows.filter((d) => !(d.userId === userId && d.deviceFingerprint !== currentFingerprint));
    return before - this.rows.length;
  }
}

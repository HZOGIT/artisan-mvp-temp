import { and, desc, eq, ne } from "drizzle-orm";
import { devices } from "../../../../drizzle/schema.pg";
import type { DbClient } from "../../../shared/db";
import type { IDeviceRepository } from "../application/device-repository";
import type { Device } from "../domain/device";

type Row = typeof devices.$inferSelect;

function toDevice(r: Row): Device {
  return {
    id: r.id,
    deviceFingerprint: r.device_fingerprint,
    deviceType: r.device_type ?? "desktop",
    browser: r.browser ?? null,
    os: r.os ?? null,
    lastIp: r.last_ip ?? null,
    lastActiveAt: r.last_active_at ?? null,
    createdAt: r.created_at ?? null,
  };
}

// Repository Drizzle `devices`. ⚠️ Table HORS RLS (denylist) → AUCUN `withTenant` ne la protège ;
// l'isolation est portée par un filtre EXPLICITE `user_id = userId` dans chaque requête (anti-IDOR :
// un utilisateur ne lit/supprime QUE ses appareils). Parité legacy (getDevices/deleteDevice/deleteOtherDevices).
export class DeviceRepositoryDrizzle implements IDeviceRepository {
  constructor(private readonly db: DbClient) {}

  async listByUser(userId: number): Promise<Device[]> {
    const rows = await this.db.select().from(devices).where(eq(devices.user_id, userId)).orderBy(desc(devices.last_active_at));
    return rows.map(toDevice);
  }

  async deleteOwned(deviceId: number, userId: number): Promise<void> {
    await this.db.delete(devices).where(and(eq(devices.id, deviceId), eq(devices.user_id, userId)));
  }

  async deleteOthers(userId: number, currentFingerprint: string): Promise<number> {
    const deleted = await this.db
      .delete(devices)
      .where(and(eq(devices.user_id, userId), ne(devices.device_fingerprint, currentFingerprint)))
      .returning({ id: devices.id });
    return deleted.length;
  }
}

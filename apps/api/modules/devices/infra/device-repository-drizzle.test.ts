import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { DeviceRepositoryDrizzle } from "./device-repository-drizzle";

const URL = process.env.DATABASE_URL;
const UA = 9967381;
const UB = 9967382;

// L2 `devices` — table HORS RLS : l'isolation est portée par le filtre EXPLICITE `user_id` du repo
// (anti-IDOR par utilisateur). On vérifie list/deleteOwned/deleteOthers + qu'un user ne touche QUE ses
// appareils.
describe.skipIf(!URL)("DeviceRepositoryDrizzle (isolation par user_id, hors RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(URL!);
  const repo = new DeviceRepositoryDrizzle(app.db);
  let artisanA = 0;
  let artisanB = 0;

  const seedDevice = async (userId: number, artisanId: number, fp: string, lastActive: string) =>
    (await admin.query('insert into devices ("user_id","artisan_id","device_fingerprint","last_active_at") values ($1,$2,$3,$4) returning id', [userId, artisanId, fp, lastActive])).rows[0].id;

  const cleanup = async () => {
    await admin.query("delete from devices where user_id = any($1)", [[UA, UB]]);
    await admin.query("delete from artisans where \"userId\" = any($1)", [[UA, UB]]);
    await admin.query("delete from users where id = any($1)", [[UA, UB]]);
  };

  beforeAll(async () => {
    await cleanup();
    for (const uid of [UA, UB]) await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UB])).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("listByUser : seulement les appareils de l'utilisateur, triés par last_active desc", async () => {
    await seedDevice(UA, artisanA, "fpA1", "2026-06-10T10:00:00Z");
    await seedDevice(UA, artisanA, "fpA2", "2026-06-12T10:00:00Z");
    await seedDevice(UB, artisanB, "fpB1", "2026-06-11T10:00:00Z");
    const a = await repo.listByUser(UA);
    expect(a.map((d) => d.deviceFingerprint)).toEqual(["fpA2", "fpA1"]); // tri desc
    expect((await repo.listByUser(UB)).map((d) => d.deviceFingerprint)).toEqual(["fpB1"]);
  });

  it("deleteOwned : anti-IDOR — A ne supprime PAS l'appareil de B", async () => {
    const devB = (await repo.listByUser(UB))[0];
    await repo.deleteOwned(devB.id, UA); // mauvais user → no-op
    expect((await repo.listByUser(UB)).length).toBe(1);
    const devA = (await repo.listByUser(UA))[0];
    await repo.deleteOwned(devA.id, UA); // bon user → supprimé
    expect((await repo.listByUser(UA)).some((d) => d.id === devA.id)).toBe(false);
  });

  it("deleteOthers : supprime les autres appareils du user (garde le courant), n'affecte pas B", async () => {
    const n = await repo.deleteOthers(UA, "fpA1"); // garde fpA1, supprime le reste de A
    expect(n).toBeGreaterThanOrEqual(0);
    const a = await repo.listByUser(UA);
    expect(a.every((d) => d.deviceFingerprint === "fpA1")).toBe(true);
    expect((await repo.listByUser(UB)).length).toBe(1); // B intact
  });
});

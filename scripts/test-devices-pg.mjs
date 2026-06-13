// scripts/test-devices-pg.mjs — OPE-184 P0.7d-9 — devices sur PG.
// registerDevice (upsert sur (user_id, fingerprint)), getDevices/getDevice,
// countActiveDevices (DISTINCT fingerprint), deleteDevice, deleteOtherDevices.
import {
  getDevices, getDevice, registerDevice, countActiveDevices,
  deleteDevice, deleteOtherDevices, getDb,
} from "../server/db.ts";
import { devices } from "../drizzle/schema.active.ts";
import { eq } from "drizzle-orm";

const U = 9915001, A = 9915001;
let ok = true;
const check = (label, cond) => { console.log(`${cond ? "✅" : "❌"} ${label}`); if (!cond) ok = false; };
const reg = (fp, extra = {}) => registerDevice({ userId: U, artisanId: A, fingerprint: fp, deviceType: "desktop", browser: "Firefox", os: "Linux", ip: "1.1.1.1", ...extra });

try {
  const db = await getDb();
  await db.delete(devices).where(eq(devices.user_id, U));

  // enregistre 2 devices
  await reg("fp-A");
  await reg("fp-B", { browser: "Chrome", ip: "2.2.2.2" });
  let list = await getDevices(U);
  check(`getDevices : 2 devices → ${list.length}`, list.length === 2);
  check(`mapping camelCase : deviceFingerprint présent → ${list[0]?.deviceFingerprint}`, !!list[0]?.deviceFingerprint);
  check(`countActiveDevices = 2 → ${await countActiveDevices(U)}`, (await countActiveDevices(U)) === 2);

  // upsert : ré-enregistre fp-A avec nouveau browser/ip → update, pas de doublon
  await reg("fp-A", { browser: "Safari", ip: "9.9.9.9" });
  list = await getDevices(U);
  check(`upsert : toujours 2 devices (pas de doublon) → ${list.length}`, list.length === 2);
  const dA = await getDevice(U, "fp-A");
  check(`upsert : fp-A browser mis à jour Safari → ${dA?.browser}`, dA?.browser === "Safari");
  check(`upsert : fp-A lastIp mis à jour 9.9.9.9 → ${dA?.lastIp}`, dA?.lastIp === "9.9.9.9");

  // getDevice inexistant → null
  check(`getDevice inexistant → null`, (await getDevice(U, "fp-X")) === null);

  // deleteDevice : supprime fp-B par id (scopé user_id)
  const dB = await getDevice(U, "fp-B");
  await deleteDevice(dB.id, U);
  check(`deleteDevice : fp-B supprimé → ${await getDevice(U, "fp-B") === null}`, (await getDevice(U, "fp-B")) === null);
  check(`countActiveDevices = 1 après delete → ${await countActiveDevices(U)}`, (await countActiveDevices(U)) === 1);

  // garde-fou : deleteDevice avec mauvais user_id → no-op
  const dA2 = await getDevice(U, "fp-A");
  await deleteDevice(dA2.id, 99999999);
  check(`deleteDevice mauvais user → fp-A toujours présent`, (await getDevice(U, "fp-A")) !== null);

  // deleteOtherDevices : ajoute fp-C puis garde seulement fp-A
  await reg("fp-C");
  const removed = await deleteOtherDevices(U, "fp-A");
  check(`deleteOtherDevices : 1 device supprimé (fp-C) → ${removed}`, removed === 1);
  list = await getDevices(U);
  check(`deleteOtherDevices : reste 1 (fp-A courant) → ${list.length}`, list.length === 1 && list[0].deviceFingerprint === "fp-A");

  // cleanup
  await db.delete(devices).where(eq(devices.user_id, U));
} catch (e) {
  console.error("❌ EXCEPTION", e);
  ok = false;
}

console.log(ok ? "\n=== ✅ DEVICES PG OK ===" : "\n=== ❌ DEVICES PG FAIL ===");
process.exit(ok ? 0 : 1);

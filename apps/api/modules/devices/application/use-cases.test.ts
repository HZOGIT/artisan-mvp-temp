import { describe, it, expect } from "vitest";
import type { TenantContext } from "../../../shared/tenant";
import { DeviceRepositoryFake } from "../infra/device-repository-fake";
import { generateFingerprint } from "../domain/device";
import { listDevices, revokeDevice, revokeOtherDevices } from "./use-cases";

const UA_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36";
const FP_DESKTOP = generateFingerprint(UA_DESKTOP);

const ctxA: TenantContext = { artisanId: 1, userId: 10 };
const ctxB: TenantContext = { artisanId: 2, userId: 20 };

function seed() {
  return new DeviceRepositoryFake([
    { id: 1, userId: 10, deviceFingerprint: FP_DESKTOP, deviceType: "desktop", browser: "Chrome", os: "Windows", lastIp: null, lastActiveAt: new Date("2026-06-10"), createdAt: new Date("2026-01-01") },
    { id: 2, userId: 10, deviceFingerprint: "fp-mobile", deviceType: "mobile", browser: "Safari", os: "iOS", lastIp: null, lastActiveAt: new Date("2026-06-12"), createdAt: new Date("2026-02-01") },
    { id: 3, userId: 20, deviceFingerprint: "fp-other-user", deviceType: "desktop", browser: "Firefox", os: "Linux", lastIp: null, lastActiveAt: new Date("2026-06-11"), createdAt: new Date("2026-03-01") },
  ]);
}

describe("listDevices", () => {
  it("ne renvoie que les appareils de l'utilisateur, plus récemment actifs d'abord", async () => {
    const repo = seed();
    const list = await listDevices(repo, ctxA);
    expect(list.map((d) => d.id)).toEqual([2, 1]); // 06-12 avant 06-10
    expect(list.every((d) => d.deviceFingerprint !== "fp-other-user")).toBe(true);
  });
});

describe("revokeDevice", () => {
  it("supprime un appareil possédé", async () => {
    const repo = seed();
    expect(await revokeDevice(repo, ctxA, 1)).toEqual({ success: true });
    expect((await listDevices(repo, ctxA)).map((d) => d.id)).toEqual([2]);
  });

  it("anti-IDOR : ne supprime pas l'appareil d'un autre utilisateur", async () => {
    const repo = seed();
    await revokeDevice(repo, ctxA, 3); // appareil de l'utilisateur 20
    expect((await listDevices(repo, ctxB)).map((d) => d.id)).toEqual([3]); // intact
  });
});

describe("revokeOtherDevices", () => {
  it("supprime tous les AUTRES appareils (garde l'empreinte courante dérivée du UA)", async () => {
    const repo = seed();
    const res = await revokeOtherDevices(repo, ctxA, UA_DESKTOP);
    expect(res).toEqual({ success: true, removed: 1 }); // supprime fp-mobile, garde le desktop courant
    expect((await listDevices(repo, ctxA)).map((d) => d.id)).toEqual([1]);
    // n'affecte pas un autre utilisateur
    expect((await listDevices(repo, ctxB)).map((d) => d.id)).toEqual([3]);
  });
});

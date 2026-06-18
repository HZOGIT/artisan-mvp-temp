import { describe, it, expect } from "vitest";
import { DeviceRepositoryFake } from "./infra/device-repository-fake";
import { createDevicesModule } from "./devices.module";

describe("createDevicesModule", () => {
  it("assemble un router avec list/revoke/revokeAll", () => {
    const mod = createDevicesModule({ repo: new DeviceRepositoryFake() });
    const r = mod.router as Record<string, unknown>;
    expect(typeof r.list).not.toBe("undefined");
    expect(typeof r.revoke).not.toBe("undefined");
    expect(typeof r.revokeAll).not.toBe("undefined");
  });
});

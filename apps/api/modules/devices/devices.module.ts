import type { IDeviceRepository } from "./application/device-repository";
import { createDevicesRouter } from "./interface/trpc/devices.router";

// Wiring DI du module « devices » (appareils/sessions de l'utilisateur, table HORS RLS scopée userId).
export interface DevicesModuleDeps {
  readonly repo: IDeviceRepository;
}

export interface DevicesModule {
  readonly deps: DevicesModuleDeps;
  readonly router: ReturnType<typeof createDevicesRouter>;
}

export function createDevicesModule(deps: DevicesModuleDeps): DevicesModule {
  return { deps, router: createDevicesRouter(deps.repo) };
}

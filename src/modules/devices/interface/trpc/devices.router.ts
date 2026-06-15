import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IDeviceRepository } from "../../application/device-repository";
import { listDevices, revokeDevice, revokeOtherDevices } from "../../application/use-cases";

// Routeur tRPC `devices` (appareils/sessions de l'utilisateur courant). Transport mince : délègue aux
// use-cases scopés par `ctx.tenant.userId`. `revokeAll` dérive l'empreinte de l'appareil courant du
// `ctx.userAgent` (parité legacy). Protégé : chacun ne gère QUE ses propres appareils.
export function createDevicesRouter(repo: IDeviceRepository) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listDevices(repo, ctx.tenant)),

    revoke: protectedProcedure
      .input(z.object({ deviceId: z.number().int().positive() }))
      .mutation(({ ctx, input }) => revokeDevice(repo, ctx.tenant, input.deviceId)),

    revokeAll: protectedProcedure.mutation(({ ctx }) => revokeOtherDevices(repo, ctx.tenant, ctx.userAgent)),
  });
}

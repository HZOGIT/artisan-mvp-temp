import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { PaPort } from "../../application/pa-port";

export function createEinvoicingRouter(pa: PaPort) {
  return router({
    emettre: protectedProcedure
      .input(z.object({ factureId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const paEntityId = `fake-entity-${ctx.tenant.artisanId}`;
        return await pa.submitInvoice({ paEntityId, invoiceId: input.factureId });
      }),

    statutDocument: protectedProcedure
      .input(z.object({ paDocumentId: z.string().min(1) }))
      .query(({ input }) => pa.getLifecycle(input.paDocumentId)),
  });
}

import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { paEntites } from "../../../../../../drizzle/schema/einvoicing";
import type { DbClient } from "../../../../shared/db";
import { withTenant } from "../../../../shared/db/with-tenant";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import { ensureArtisanEntity } from "../../application/ensure-artisan-entity";
import type { PaPort } from "../../application/pa-port";

export function createEinvoicingRouter(pa: PaPort, db: DbClient) {
  return router({
    onboardEntity: protectedProcedure.mutation(({ ctx }) =>
      ensureArtisanEntity(db, pa, ctx.tenant),
    ),

    emettre: protectedProcedure
      .input(z.object({ factureId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const [entite] = await withTenant(db, ctx.tenant, async (tx) =>
          tx
            .select({ paEntityId: paEntites.paEntityId })
            .from(paEntites)
            .where(
              and(
                eq(paEntites.artisanId, ctx.tenant.artisanId),
                eq(paEntites.statutProvisioning, "done"),
              ),
            )
            .limit(1),
        );

        if (!entite?.paEntityId) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Activez d'abord la facturation électronique dans vos paramètres",
          });
        }

        return await pa.submitInvoice({ paEntityId: entite.paEntityId, invoiceId: input.factureId });
      }),

    statutDocument: protectedProcedure
      .input(z.object({ paDocumentId: z.string().min(1) }))
      .query(({ input }) => pa.getLifecycle(input.paDocumentId)),
  });
}

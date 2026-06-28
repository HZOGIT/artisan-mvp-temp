import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { paEntites, facturesEntrantes, superpdpTokens } from "../../../../../../drizzle/schema/einvoicing";
import { factures as facturesTable } from "../../../../../../drizzle/schema/factures";
import type { DbClient } from "../../../../shared/db";
import { withTenant } from "../../../../shared/db/with-tenant";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import { ensureArtisanEntity } from "../../application/ensure-artisan-entity";
import type { PaPort } from "../../application/pa-port";
import { ValidationError } from "../../../../shared/errors";

export function createEinvoicingRouter(pa: PaPort, db: DbClient, paDisponible: boolean) {
  return router({
    onboardEntity: protectedProcedure.mutation(({ ctx }) => {
      if (!paDisponible) throw new ValidationError("Aucune plateforme de dématérialisation configurée");
      return ensureArtisanEntity(db, pa, ctx.tenant);
    }),

    statutEntite: protectedProcedure.query(({ ctx }) =>
      withTenant(db, ctx.tenant, (tx) =>
        tx
          .select({
            statutProvisioning: paEntites.statutProvisioning,
            kybStatut: paEntites.kybStatut,
            paEntityId: paEntites.paEntityId,
            derniereErreur: paEntites.derniereErreur,
          })
          .from(paEntites)
          .where(eq(paEntites.artisanId, ctx.tenant.artisanId))
          .limit(1)
          .then((rows) => ({ ...rows[0], paDisponible })),
      ),
    ),

    oauthStatut: protectedProcedure.query(({ ctx }) =>
      withTenant(db, ctx.tenant, (tx) =>
        tx
          .select({ expiresAt: superpdpTokens.expiresAt, updatedAt: superpdpTokens.updatedAt })
          .from(superpdpTokens)
          .where(eq(superpdpTokens.artisanId, ctx.tenant.artisanId))
          .limit(1)
          .then((rows) => ({ connecte: rows.length > 0, expiresAt: rows[0]?.expiresAt ?? null })),
      ),
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

        const result = await pa.submitInvoice({ paEntityId: entite.paEntityId, invoiceId: input.factureId });
        await withTenant(db, ctx.tenant, (tx) =>
          tx.update(facturesTable).set({ paDocumentId: result.paDocumentId }).where(eq(facturesTable.id, input.factureId)).then(() => {}),
        );
        return result;
      }),

    statutDocument: protectedProcedure
      .input(z.object({ paDocumentId: z.string().min(1) }))
      .query(({ input }) => pa.getLifecycle(input.paDocumentId)),

    facturesEntrantes: router({
      liste: protectedProcedure
        .input(z.object({ page: z.number().int().min(1).default(1) }))
        .query(({ ctx, input }) =>
          withTenant(db, ctx.tenant, (tx) =>
            tx
              .select({
                id: facturesEntrantes.id,
                paDocumentId: facturesEntrantes.paDocumentId,
                emetteurSiret: facturesEntrantes.emetteurSiret,
                montantTTC: facturesEntrantes.montantTTC,
                date: facturesEntrantes.date,
                fetchedAt: facturesEntrantes.fetchedAt,
                lu: facturesEntrantes.lu,
              })
              .from(facturesEntrantes)
              .where(eq(facturesEntrantes.artisanId, ctx.tenant.artisanId))
              .orderBy(desc(facturesEntrantes.date))
              .limit(20)
              .offset((input.page - 1) * 20),
          ),
        ),

      lire: protectedProcedure
        .input(z.object({ id: z.number().int().positive() }))
        .query(async ({ ctx, input }) => {
          const rows = await withTenant(db, ctx.tenant, (tx) =>
            tx
              .select()
              .from(facturesEntrantes)
              .where(
                and(
                  eq(facturesEntrantes.id, input.id),
                  eq(facturesEntrantes.artisanId, ctx.tenant.artisanId),
                ),
              )
              .limit(1),
          );

          const facture = rows[0];
          if (!facture) throw new TRPCError({ code: "NOT_FOUND" });

          if (!facture.lu) {
            await withTenant(db, ctx.tenant, (tx) =>
              tx
                .update(facturesEntrantes)
                .set({ lu: true })
                .where(eq(facturesEntrantes.id, input.id)),
            );
          }

          return { ...facture, lu: true };
        }),
    }),
  });
}

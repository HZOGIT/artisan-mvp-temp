import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IEmailLogReader } from "../../application/email-log-reader";
import { listEmails } from "../../application/use-cases";

/** Routeur tRPC du journal d'emails. Surface client = `list` (lecture seule, filtres entité + limite). */
export function createEmailsRouter(reader: IEmailLogReader) {
  return router({
    list: protectedProcedure
      .input(
        z
          .object({
            entiteType: z.enum(["devis", "facture", "intervention"]).optional(),
            entiteId: z.number().int().positive().optional(),
            limit: z.number().int().min(1).max(500).optional(),
          })
          .optional(),
      )
      .query(({ ctx, input }) => listEmails(reader, ctx.tenant, input ?? {})),
  });
}

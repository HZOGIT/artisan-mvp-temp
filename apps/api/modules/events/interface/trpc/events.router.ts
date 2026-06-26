import { z } from "zod";
import { protectedProcedure, router } from "../../../../interface/trpc/trpc";
import type { IEventReader } from "../../application/event-reader";

export function createEventsRouter(reader: IEventReader) {
  return router({
    list: protectedProcedure
      .input(z.object({
        page: z.number().int().min(1).optional().default(1),
        type: z.string().optional(),
      }))
      .query(async ({ input, ctx }) => {
        return reader.list(ctx.tenant, { page: input.page, type: input.type });
      }),
  });
}

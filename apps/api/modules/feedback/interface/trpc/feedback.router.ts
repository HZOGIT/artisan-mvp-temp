import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IFeedbackSink } from "../../application/feedback-sink";

export function createFeedbackRouter(sink: IFeedbackSink) {
  return router({
    submit: protectedProcedure
      .input(
        z.object({
          type: z.enum(["bug", "suggestion"]),
          message: z.string().min(1).max(2000),
          page: z.string().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const result = await sink.submit({ type: input.type, message: input.message, page: input.page, email: ctx.claims?.email ?? "" });
        if (!result.ok) ctx.log.warn({ event: "feedback_sink_rejected", type: input.type }, "notion feedback sink a rejeté la soumission");
        return result;
      }),
  });
}

import { z } from "zod";
import { router, protectedProcedure } from "../../interface/trpc/trpc";

export interface FeedbackRouterDeps {
  readonly notionToken: string | undefined;
  readonly notionDatabaseId: string | undefined;
}

export function createFeedbackRouter(deps: FeedbackRouterDeps) {
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
        if (!deps.notionToken || !deps.notionDatabaseId) return { ok: false as const };

        const res = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${deps.notionToken}`,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            parent: { database_id: deps.notionDatabaseId },
            properties: {
              Name: { title: [{ text: { content: `[${input.type.toUpperCase()}] ${input.message.slice(0, 80)}` } }] },
              Type: { select: { name: input.type === "bug" ? "Bug" : "Suggestion" } },
              Message: { rich_text: [{ text: { content: input.message } }] },
              Page: { rich_text: [{ text: { content: input.page ?? "" } }] },
              Email: { email: ctx.claims?.email ?? "" },
            },
          }),
        });

        if (!res.ok) {
          ctx.log.warn({ event: "notion_feedback_error", status: res.status }, "Notion API error on feedback submit");
        }

        return { ok: res.ok };
      }),
  });
}

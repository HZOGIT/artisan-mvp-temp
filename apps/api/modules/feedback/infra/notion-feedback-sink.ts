import type { IFeedbackSink } from "../application/feedback-sink";
import type { FeedbackInput } from "../domain/feedback";

export class NotionFeedbackSink implements IFeedbackSink {
  constructor(private readonly token: string, private readonly databaseId: string) {}

  async submit(input: FeedbackInput): Promise<{ ok: boolean }> {
    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { database_id: this.databaseId },
        properties: {
          Name: { title: [{ text: { content: `[${input.type.toUpperCase()}] ${input.message.slice(0, 80)}` } }] },
          Type: { select: { name: input.type === "bug" ? "Bug" : "Suggestion" } },
          Message: { rich_text: [{ text: { content: input.message } }] },
          Page: { rich_text: [{ text: { content: input.page ?? "" } }] },
          Email: { email: input.email },
        },
      }),
    });
    return { ok: res.ok };
  }
}

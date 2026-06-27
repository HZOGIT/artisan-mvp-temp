import type { IFeedbackSink } from "../application/feedback-sink";
import type { FeedbackInput } from "../domain/feedback";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export class NotionFeedbackSink implements IFeedbackSink {
  constructor(
    private readonly token: string,
    private readonly databaseId: string,
    private readonly environment: "Staging" | "Production",
  ) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    };
  }

  async submit(input: FeedbackInput): Promise<{ ok: boolean }> {
    const prefix = input.type === "bug" ? "[BUG]" : "[SUGGESTION]";
    const res = await fetch(`${NOTION_API}/pages`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        parent: { database_id: this.databaseId },
        properties: {
          Titre: { title: [{ text: { content: `${prefix} ${input.message.slice(0, 80)}` } }] },
          Description: { rich_text: [{ text: { content: input.message } }] },
          "URL concernée": { url: input.page ?? null },
          Email: { email: input.email },
          Environnement: { select: { name: this.environment } },
        },
      }),
    });
    return { ok: res.ok };
  }

  /** Crée la propriété `Email` (type email) si elle est absente de la DB Notion. Idempotent. */
  async syncSchema(): Promise<void> {
    const dbRes = await fetch(`${NOTION_API}/databases/${this.databaseId}`, {
      headers: this.headers(),
    });
    if (!dbRes.ok) throw new Error(`notion GET database → ${dbRes.status}`);
    const db = await dbRes.json() as { properties: Record<string, unknown> };
    if (db.properties["Email"]) return;
    const patchRes = await fetch(`${NOTION_API}/databases/${this.databaseId}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify({ properties: { Email: { email: {} } } }),
    });
    if (!patchRes.ok) throw new Error(`notion PATCH database → ${patchRes.status}`);
  }
}

import { createFeedbackRouter } from "./interface/trpc/feedback.router";
import { NotionFeedbackSink } from "./infra/notion-feedback-sink";
import { noopFeedbackSink, type IFeedbackSink } from "./application/feedback-sink";

export interface FeedbackModuleDeps {
  readonly notionToken?: string | undefined;
  readonly notionDatabaseId?: string | undefined;
  readonly notionEnvironment?: "Staging" | "Production";
  /** Sink injectable pour les tests (prioritaire sur token/databaseId). */
  readonly sink?: IFeedbackSink;
}

export interface FeedbackModule {
  readonly router: ReturnType<typeof createFeedbackRouter>;
  /** Synchronise le schéma de la DB Notion (crée les propriétés manquantes). Non-fatal si échoue. */
  readonly syncSchema?: () => Promise<void>;
}

export function createFeedbackModule(deps: FeedbackModuleDeps): FeedbackModule {
  const notionSink =
    !deps.sink && deps.notionToken && deps.notionDatabaseId
      ? new NotionFeedbackSink(deps.notionToken, deps.notionDatabaseId, deps.notionEnvironment ?? "Production")
      : null;
  const sink = deps.sink ?? notionSink ?? noopFeedbackSink;
  return {
    router: createFeedbackRouter(sink),
    syncSchema: notionSink ? () => notionSink.syncSchema() : undefined,
  };
}

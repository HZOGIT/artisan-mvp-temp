import { createFeedbackRouter } from "./interface/trpc/feedback.router";
import { NotionFeedbackSink } from "./infra/notion-feedback-sink";
import { noopFeedbackSink, type IFeedbackSink } from "./application/feedback-sink";

export interface FeedbackModuleDeps {
  readonly notionToken?: string | undefined;
  readonly notionDatabaseId?: string | undefined;
  /** Sink injectable pour les tests (prioritaire sur token/databaseId). */
  readonly sink?: IFeedbackSink;
}

export interface FeedbackModule {
  readonly router: ReturnType<typeof createFeedbackRouter>;
}

export function createFeedbackModule(deps: FeedbackModuleDeps): FeedbackModule {
  const sink =
    deps.sink ??
    (deps.notionToken && deps.notionDatabaseId
      ? new NotionFeedbackSink(deps.notionToken, deps.notionDatabaseId)
      : noopFeedbackSink);
  return { router: createFeedbackRouter(sink) };
}

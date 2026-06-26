import { createFeedbackRouter, type FeedbackRouterDeps } from "./feedback.router";

export interface FeedbackModule {
  readonly router: ReturnType<typeof createFeedbackRouter>;
}

export function createFeedbackModule(deps: FeedbackRouterDeps): FeedbackModule {
  return { router: createFeedbackRouter(deps) };
}

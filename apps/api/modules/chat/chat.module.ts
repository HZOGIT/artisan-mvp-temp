import type { ChatDeps } from "./application/use-cases";
import { createChatRouter } from "./interface/trpc/chat.router";

// Wiring DI du module chat : repo conversations/messages + notifier email client (best-effort).
export interface ChatModule {
  readonly deps: ChatDeps;
  readonly router: ReturnType<typeof createChatRouter>;
}

export function createChatModule(deps: ChatDeps): ChatModule {
  return { deps, router: createChatRouter(deps) };
}

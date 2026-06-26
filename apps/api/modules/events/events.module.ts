import { createEventsRouter } from "./interface/trpc/events.router";
import type { DbClient } from "../../shared/db";

export interface EventsModuleDeps {
  readonly db: DbClient;
}

export interface EventsModule {
  readonly router: ReturnType<typeof createEventsRouter>;
}

export function createEventsModule(deps: EventsModuleDeps): EventsModule {
  return { router: createEventsRouter(deps.db) };
}

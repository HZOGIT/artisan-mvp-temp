import { createEventsRouter } from "./interface/trpc/events.router";
import { EventReaderDrizzle } from "./infra/event-reader-drizzle";
import type { DbClient } from "../../shared/db";
import type { IEventReader } from "./application/event-reader";

export interface EventsModuleDeps {
  readonly db: DbClient;
  readonly reader?: IEventReader;
}

export interface EventsModule {
  readonly router: ReturnType<typeof createEventsRouter>;
}

export function createEventsModule(deps: EventsModuleDeps): EventsModule {
  const reader = deps.reader ?? new EventReaderDrizzle(deps.db);
  return { router: createEventsRouter(reader) };
}

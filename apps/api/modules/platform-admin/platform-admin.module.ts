import type { DbClient } from "../../shared/db";
import { createPlatformAdminRouter } from "./interface/trpc/platform-admin.router";

export interface PlatformAdminModule {
  readonly router: ReturnType<typeof createPlatformAdminRouter>;
}

export function createPlatformAdminModule(db: DbClient): PlatformAdminModule {
  return { router: createPlatformAdminRouter(db) };
}

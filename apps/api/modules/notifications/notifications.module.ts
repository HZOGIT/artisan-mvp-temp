import type { INotificationRepository } from "./application/notification-repository";
import { createNotificationsRouter } from "./interface/trpc/notifications.router";

// Wiring DI du module notifications : assemble le routeur tRPC à partir du repository
// injecté. Découple `app.ts`/`createAppRouter` des détails d'instanciation.
export interface NotificationsModuleDeps {
  readonly repository: INotificationRepository;
}

export interface NotificationsModule {
  readonly deps: NotificationsModuleDeps;
  readonly router: ReturnType<typeof createNotificationsRouter>;
}

export function createNotificationsModule(deps: NotificationsModuleDeps): NotificationsModule {
  return { deps, router: createNotificationsRouter(deps.repository) };
}

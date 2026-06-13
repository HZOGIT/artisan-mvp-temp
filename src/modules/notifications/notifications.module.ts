import type { INotificationRepository } from "./application/notification-repository";

// Wiring DI du module notifications. Use-cases et adapter tRPC assemblés aux étapes
// suivantes du gabarit ; ici la forme des dépendances + le factory squelette.
export interface NotificationsModuleDeps {
  readonly repository: INotificationRepository;
}

export interface NotificationsModule {
  readonly deps: NotificationsModuleDeps;
}

export function createNotificationsModule(deps: NotificationsModuleDeps): NotificationsModule {
  return { deps };
}

import { describe, it, expect } from "vitest";
import { createNotificationsModule } from "./notifications.module";
import type { INotificationRepository } from "./application/notification-repository";

const stubRepo: INotificationRepository = {
  list: async () => [],
  countUnread: async () => 0,
  markAsRead: async () => false,
  markAllAsRead: async () => 0,
  archive: async () => false,
};

describe("notifications.module (scaffold)", () => {
  it("createNotificationsModule câble le repository injecté", () => {
    const module = createNotificationsModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["archive", "countUnread", "list", "markAllAsRead", "markAsRead"]);
  });
});

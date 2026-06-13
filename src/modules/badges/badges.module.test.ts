import { describe, it, expect } from "vitest";
import { createBadgesModule } from "./badges.module";
import type { IBadgeRepository } from "./application/badge-repository";

const stubRepo: IBadgeRepository = {
  list: async () => [],
  getById: async () => null,
  create: async () => {
    throw new Error("non implémenté (stub)");
  },
  update: async () => null,
  delete: async () => false,
  listBadgesTechnicien: async () => [],
  attribuer: async () => null,
};

describe("badges.module (scaffold)", () => {
  it("createBadgesModule câble le repository injecté", () => {
    const module = createBadgesModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose les opérations attendues", () => {
    expect(Object.keys(stubRepo).sort()).toEqual([
      "attribuer",
      "create",
      "delete",
      "getById",
      "list",
      "listBadgesTechnicien",
      "update",
    ]);
  });
});

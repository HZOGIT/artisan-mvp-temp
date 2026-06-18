import { describe, it, expect } from "vitest";
import { createArtisanModule } from "./artisan.module";
import type { IArtisanRepository } from "./application/artisan-repository";

const stubRepo: IArtisanRepository = {
  getProfile: async () => null,
  update: async () => null,
  isSlugAvailable: async () => true,
};

describe("artisan.module", () => {
  it("createArtisanModule câble le repository injecté", () => {
    const module = createArtisanModule({ repository: stubRepo });
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose getProfile/update/isSlugAvailable", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["getProfile", "isSlugAvailable", "update"]);
  });

  it("expose le routeur tRPC (getProfile/updateProfile)", () => {
    const module = createArtisanModule({ repository: stubRepo });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual(["getProfile", "updateProfile"]);
  });
});

import { describe, it, expect } from "vitest";
import { createArtisanModule } from "./artisan.module";
import type { IArtisanRepository } from "./application/artisan-repository";
import type { IAuthRepository } from "../auth/application/auth-repository";
import { FakePasswordHasher } from "../../shared/ports/password-hasher-bcrypt";

const stubRepo: IArtisanRepository = {
  getProfile: async () => null,
  update: async () => null,
  isSlugAvailable: async () => true,
};

const stubAuthRepo: IAuthRepository = {
  findCredentials: async () => null,
  getById: async () => null,
  touchLastSignedIn: async () => undefined,
  findCredentialsById: async () => null,
  findIdByEmail: async () => null,
  updateEmail: async () => undefined,
  updatePassword: async () => undefined,
  setResetToken: async () => undefined,
  findByValidResetToken: async () => null,
  resetPasswordWithToken: async () => undefined,
  softDelete: async () => undefined,
  getPasswordChangedAt: async () => null,
  bumpPasswordChangedAt: async () => undefined,
  createUser: async () => ({ id: 0, email: null }),
  bootstrapAccount: async () => undefined,
};

const stubDeps = { repository: stubRepo, authRepo: stubAuthRepo, hasher: new FakePasswordHasher() };

describe("artisan.module", () => {
  it("createArtisanModule câble le repository injecté", () => {
    const module = createArtisanModule(stubDeps);
    expect(module.deps.repository).toBe(stubRepo);
  });

  it("le port expose getProfile/update/isSlugAvailable", () => {
    expect(Object.keys(stubRepo).sort()).toEqual(["getProfile", "isSlugAvailable", "update"]);
  });

  it("expose le routeur tRPC (getProfile/updateProfile)", () => {
    const module = createArtisanModule(stubDeps);
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual(["getProfile", "updateProfile"]);
  });
});

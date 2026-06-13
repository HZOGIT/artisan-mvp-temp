import { describe, it, expect } from "vitest";
import { expectCrossTenantDenied, isCrossTenantDenial } from "./cross-tenant";
import { NotFoundError, ForbiddenError } from "../errors";
import { UnauthenticatedError, MissingTenantError } from "../tenant";

describe("isCrossTenantDenial", () => {
  it("reconnaît les erreurs de refus par nom", () => {
    expect(isCrossTenantDenial(new NotFoundError())).toBe(true);
    expect(isCrossTenantDenial(new ForbiddenError())).toBe(true);
    expect(isCrossTenantDenial(new UnauthenticatedError())).toBe(true);
    expect(isCrossTenantDenial(new MissingTenantError())).toBe(true);
  });

  it("reconnaît les erreurs de refus par code (ex. TRPCError-like)", () => {
    expect(isCrossTenantDenial({ name: "TRPCError", code: "NOT_FOUND" })).toBe(true);
    expect(isCrossTenantDenial({ code: "FORBIDDEN" })).toBe(true);
  });

  it("ne confond pas une erreur quelconque avec un refus", () => {
    expect(isCrossTenantDenial(new Error("boom"))).toBe(false);
    expect(isCrossTenantDenial({ code: "INTERNAL" })).toBe(false);
    expect(isCrossTenantDenial(null)).toBe(false);
  });
});

describe("expectCrossTenantDenied", () => {
  it("passe si l'accès lève NotFoundError", async () => {
    await expectCrossTenantDenied(async () => {
      throw new NotFoundError();
    });
  });

  it("passe si l'accès lève ForbiddenError", async () => {
    await expectCrossTenantDenied(async () => {
      throw new ForbiddenError();
    });
  });

  it("passe si l'accès renvoie null / undefined / [] (pas de fuite)", async () => {
    await expectCrossTenantDenied(async () => null);
    await expectCrossTenantDenied(async () => undefined);
    await expectCrossTenantDenied(async () => []);
  });

  it("ÉCHOUE si l'accès renvoie la ressource (fuite)", async () => {
    await expect(
      expectCrossTenantDenied(async () => ({ id: 1, nom: "ressource de B" })),
    ).rejects.toThrow(/FUITE CROSS-TENANT/);
  });

  it("ÉCHOUE si l'accès lève une erreur inattendue (ni NOT_FOUND/FORBIDDEN)", async () => {
    await expect(
      expectCrossTenantDenied(async () => {
        throw new Error("boom interne");
      }),
    ).rejects.toThrow(/INATTENDUE/);
  });
});

import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import { router, permissionProcedure } from "./trpc";
import { makeCreateContext } from "./context";
import type { AppContext } from "./context";

const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const signToken = (userId: number, email: string) =>
  new SignJWT({ userId, email }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));

// Routeur de test minimal gardé par `utilisateurs.gerer`.
const testRouter = router({
  gerer: permissionProcedure("utilisateurs.gerer").query(() => "ok"),
});

const baseCtx = (over: Partial<AppContext>): AppContext => ({
  claims: { userId: 1, email: "u@t.fr" },
  tenant: { artisanId: 10, userId: 1 },
  role: "secretaire",
  permissions: [],
  res: null,
  clientIp: "unknown",
  userAgent: "unknown",
  ...over,
});

describe("permissionProcedure (seam d'autorisation par permission)", () => {
  it("admin → bypasse la permission (même sans la posséder)", async () => {
    const caller = testRouter.createCaller(baseCtx({ role: "admin", permissions: [] }));
    expect(await caller.gerer()).toBe("ok");
  });

  it("non-admin possédant la permission → autorisé", async () => {
    const caller = testRouter.createCaller(baseCtx({ role: "secretaire", permissions: ["utilisateurs.gerer", "devis.voir"] }));
    expect(await caller.gerer()).toBe("ok");
  });

  it("non-admin sans la permission → FORBIDDEN", async () => {
    const caller = testRouter.createCaller(baseCtx({ role: "technicien", permissions: ["devis.voir"] }));
    await expect(caller.gerer()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("sans tenant résolu → UNAUTHORIZED (requireTenant avant la permission)", async () => {
    const caller = testRouter.createCaller(baseCtx({ tenant: null, permissions: ["utilisateurs.gerer"] }));
    await expect(caller.gerer()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("makeCreateContext : résolution des permissions", () => {
  it("token valide → permissions résolues via le reader (clé par userId)", async () => {
    const create = makeCreateContext({
      jwtSecret: SECRET,
      permissionsReader: { getPermissions: async (uid) => (uid === 7 ? ["utilisateurs.gerer", "devis.voir"] : []) },
    });
    const token = await signToken(7, "u@t.fr");
    const ctx = await create({ req: { cookies: { token } } as never, res: {} as never });
    expect(ctx.permissions).toEqual(["utilisateurs.gerer", "devis.voir"]);
  });

  it("sans cookie → claims null → permissions vides (pas d'appel reader)", async () => {
    let called = false;
    const create = makeCreateContext({
      jwtSecret: SECRET,
      permissionsReader: { getPermissions: async () => { called = true; return ["x"]; } },
    });
    const ctx = await create({ req: { cookies: {} } as never, res: {} as never });
    expect(ctx.permissions).toEqual([]);
    expect(called).toBe(false);
  });
});

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

  it("owner (isOwner: true) sans permission DB → autorisé (bypass propriétaire)", async () => {
    const caller = testRouter.createCaller(baseCtx({ tenant: { artisanId: 10, userId: 1, isOwner: true }, permissions: [] }));
    expect(await caller.gerer()).toBe("ok");
  });

  it("collaborateur (isOwner: false) sans permission → FORBIDDEN", async () => {
    const caller = testRouter.createCaller(baseCtx({ tenant: { artisanId: 10, userId: 2, isOwner: false }, permissions: [] }));
    await expect(caller.gerer()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("makeCreateContext : révocation par passwordChangedAt", () => {
  const KEY = new TextEncoder().encode(SECRET);
  const signWithIat = (iatSec: number) =>
    new SignJWT({ userId: 1, email: "u@t.fr" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt(iatSec).setExpirationTime("1h").sign(KEY);
  const signNoIat = () =>
    new SignJWT({ userId: 1, email: "u@t.fr" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(KEY);

  const nowSec = () => Math.floor(Date.now() / 1000);
  const fakeLog = { warn: () => {}, info: () => {}, error: () => {}, debug: () => {}, child() { return fakeLog; } } as never;
  const makeReq = (token: string) => ({ cookies: { token }, log: fakeLog, ip: undefined }) as never;

  it("passwordChangedAt null → token accepté (pas de révocation)", async () => {
    const create = makeCreateContext({ jwtSecret: SECRET, revocationReader: { getPasswordChangedAt: async () => null } });
    const token = await signWithIat(nowSec() - 120);
    const ctx = await create({ req: makeReq(token), res: {} as never });
    expect(ctx.claims).toMatchObject({ userId: 1 });
  });

  it("iat après passwordChangedAt → token accepté", async () => {
    const changedAtMs = Date.now() - 60_000;
    const create = makeCreateContext({ jwtSecret: SECRET, revocationReader: { getPasswordChangedAt: async () => new Date(changedAtMs) } });
    const token = await signWithIat(nowSec());
    const ctx = await create({ req: makeReq(token), res: {} as never });
    expect(ctx.claims).toMatchObject({ userId: 1 });
  });

  it("iat avant passwordChangedAt → token rejeté (claims null)", async () => {
    const changedAtMs = Date.now();
    const create = makeCreateContext({ jwtSecret: SECRET, revocationReader: { getPasswordChangedAt: async () => new Date(changedAtMs) } });
    const token = await signWithIat(nowSec() - 120);
    const ctx = await create({ req: makeReq(token), res: {} as never });
    expect(ctx.claims).toBeNull();
  });

  it("token sans iat + passwordChangedAt posé → rejeté (fail-closed)", async () => {
    const create = makeCreateContext({ jwtSecret: SECRET, revocationReader: { getPasswordChangedAt: async () => new Date(Date.now() - 60_000) } });
    const token = await signNoIat();
    const ctx = await create({ req: makeReq(token), res: {} as never });
    expect(ctx.claims).toBeNull();
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

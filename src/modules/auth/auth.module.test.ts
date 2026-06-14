import { describe, it, expect } from "vitest";
import type { FastifyReply } from "fastify";
import { createAuthModule } from "./auth.module";
import { FakeAuthRepository } from "./infra/auth-repository-fake";
import { FakePasswordHasher } from "../../shared/ports/password-hasher-bcrypt";
import type { AppContext } from "../../interface/trpc/context";

const SECRET = "test-secret-at-least-32-characters-long-xxxx";

function fakeRes() {
  const cookies: { method: string; name: string; value?: string }[] = [];
  const res = {
    setCookie: (name: string, value: string) => { cookies.push({ method: "set", name, value }); return res; },
    clearCookie: (name: string) => { cookies.push({ method: "clear", name }); return res; },
  } as unknown as FastifyReply;
  return { res, cookies };
}

const ctx = (over: Partial<AppContext>): AppContext => ({ claims: null, tenant: null, role: null, permissions: [], res: null, ...over });

describe("auth.module (router via createCaller)", () => {
  function build() {
    const repo = new FakeAuthRepository();
    repo.seed({ id: 7, email: "ok@t.fr", password: "hashed:secret", role: "artisan", name: "Jean" });
    return createAuthModule({ repository: repo, hasher: new FakePasswordHasher(), jwtSecret: SECRET });
  }

  it("expose les 9 procédures auth", () => {
    const procedures = Object.keys((build().router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual(["deleteAccount", "forgotPassword", "logout", "me", "resetPassword", "signin", "signup", "updateEmail", "updatePassword"]);
  });

  it("signin : pose le cookie `token` et renvoie {success, user}", async () => {
    const module = build();
    const { res, cookies } = fakeRes();
    const caller = module.router.createCaller(ctx({ res }));
    const out = await caller.signin({ email: "ok@t.fr", password: "secret" });
    expect(out).toMatchObject({ success: true, user: { id: 7, email: "ok@t.fr" } });
    expect(cookies).toEqual([{ method: "set", name: "token", value: expect.any(String) }]);
  });

  it("logout : efface le cookie `token`", async () => {
    const module = build();
    const { res, cookies } = fakeRes();
    const caller = module.router.createCaller(ctx({ res }));
    expect(await caller.logout()).toEqual({ success: true });
    expect(cookies).toEqual([{ method: "clear", name: "token" }]);
  });

  it("me : null si non authentifié ; user si claims", async () => {
    const module = build();
    expect(await module.router.createCaller(ctx({})).me()).toBeNull();
    const out = await module.router.createCaller(ctx({ claims: { userId: 7, email: "ok@t.fr" }, permissions: ["devis.voir"] })).me();
    expect(out).toMatchObject({ id: 7, permissions: ["devis.voir"] });
  });
});

import { describe, it, expect } from "vitest";
import type { FastifyReply } from "fastify";
import { AUTH_COOKIE_MAX_AGE_S, AUTH_COOKIE_NAME, clearAuthCookie, setAuthCookie } from "./auth-cookie";

// Reply factice capturant les appels setCookie/clearCookie (suffisant pour valider les attributs).
function fakeReply() {
  const calls: { method: string; name: string; value?: string; opts: Record<string, unknown> }[] = [];
  const reply = {
    setCookie: (name: string, value: string, opts: Record<string, unknown>) => {
      calls.push({ method: "set", name, value, opts });
      return reply;
    },
    clearCookie: (name: string, opts: Record<string, unknown>) => {
      calls.push({ method: "clear", name, opts });
      return reply;
    },
  } as unknown as FastifyReply;
  return { reply, calls };
}

describe("auth-cookie (cookie httpOnly `token`)", () => {
  it("setAuthCookie : pose le cookie token httpOnly/sameSite=lax/path=/ + maxAge 7 j", () => {
    const { reply, calls } = fakeReply();
    setAuthCookie(reply, "JWT123");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "set", name: AUTH_COOKIE_NAME, value: "JWT123" });
    expect(calls[0].opts).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: AUTH_COOKIE_MAX_AGE_S });
    expect(AUTH_COOKIE_MAX_AGE_S).toBe(604800);
  });

  it("clearAuthCookie : efface le cookie token (mêmes attributs, sans maxAge)", () => {
    const { reply, calls } = fakeReply();
    clearAuthCookie(reply);
    expect(calls[0]).toMatchObject({ method: "clear", name: AUTH_COOKIE_NAME });
    expect(calls[0].opts).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(calls[0].opts.maxAge).toBeUndefined();
  });
});

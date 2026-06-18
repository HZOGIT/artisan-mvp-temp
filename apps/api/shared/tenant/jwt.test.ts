import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import { verifyAuthToken, extractTokenFromCookieHeader } from "./jwt";

const SECRET = "test-secret-at-least-32-characters-long-xxxx";

async function sign(payload: Record<string, unknown>, expSeconds?: number): Promise<string> {
  const key = new TextEncoder().encode(SECRET);
  let builder = new SignJWT(payload).setProtectedHeader({ alg: "HS256" });
  if (expSeconds !== undefined) builder = builder.setExpirationTime(expSeconds);
  return builder.sign(key);
}

describe("verifyAuthToken", () => {
  it("extrait les claims d'un JWT valide", async () => {
    const token = await sign({ userId: 42, email: "a@b.fr" });
    expect(await verifyAuthToken(token, SECRET)).toEqual({ userId: 42, email: "a@b.fr" });
  });

  it("retourne null si le token est absent", async () => {
    expect(await verifyAuthToken(undefined, SECRET)).toBeNull();
    expect(await verifyAuthToken(null, SECRET)).toBeNull();
    expect(await verifyAuthToken("", SECRET)).toBeNull();
  });

  it("retourne null si le secret est vide", async () => {
    const token = await sign({ userId: 1, email: "x@y.fr" });
    expect(await verifyAuthToken(token, "")).toBeNull();
  });

  it("retourne null sur mauvais secret (signature invalide)", async () => {
    const token = await sign({ userId: 1, email: "x@y.fr" });
    expect(await verifyAuthToken(token, "wrong-secret-also-32-characters-long-xx")).toBeNull();
  });

  it("retourne null sur token malformé", async () => {
    expect(await verifyAuthToken("not.a.jwt", SECRET)).toBeNull();
  });

  it("retourne null si les claims ont une forme inattendue (userId non numérique)", async () => {
    const token = await sign({ userId: "42", email: "a@b.fr" });
    expect(await verifyAuthToken(token, SECRET)).toBeNull();
  });

  it("retourne null si email manquant", async () => {
    const token = await sign({ userId: 7 });
    expect(await verifyAuthToken(token, SECRET)).toBeNull();
  });

  it("retourne null sur token expiré", async () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    const token = await sign({ userId: 1, email: "x@y.fr" }, past);
    expect(await verifyAuthToken(token, SECRET)).toBeNull();
  });
});

describe("extractTokenFromCookieHeader", () => {
  it("extrait le cookie token parmi d'autres", () => {
    expect(extractTokenFromCookieHeader("foo=bar; token=abc123; baz=qux")).toBe("abc123");
  });

  it("décode la valeur url-encodée", () => {
    expect(extractTokenFromCookieHeader("token=a%20b")).toBe("a b");
  });

  it("retourne null si le cookie est absent ou le header vide", () => {
    expect(extractTokenFromCookieHeader("foo=bar")).toBeNull();
    expect(extractTokenFromCookieHeader(undefined)).toBeNull();
    expect(extractTokenFromCookieHeader("")).toBeNull();
  });

  it("supporte un nom de cookie personnalisé", () => {
    expect(extractTokenFromCookieHeader("session=xyz", "session")).toBe("xyz");
  });
});

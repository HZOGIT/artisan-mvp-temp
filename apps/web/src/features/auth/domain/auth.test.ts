import { describe, expect, it } from "vitest";
import { validateSignin, validateSignup, validateReset, tokenFromSearch } from "./auth";

describe("auth — domain pur", () => {
  it("validateSignin : champs requis", () => {
    expect(validateSignin("a@b.fr", "pw")).toBeNull();
    expect(validateSignin("", "pw")).toBe("errChamps");
    expect(validateSignin("a@b.fr", "")).toBe("errChamps");
  });

  it("validateSignup : requis → match → longueur", () => {
    expect(validateSignup("a@b.fr", "secret1", "secret1")).toBeNull();
    expect(validateSignup("", "x", "x")).toBe("errChamps");
    expect(validateSignup("a@b.fr", "secret1", "autre")).toBe("errMatch");
    expect(validateSignup("a@b.fr", "12345", "12345")).toBe("errLen");
  });

  it("validateReset : longueur → match", () => {
    expect(validateReset("secret1", "secret1")).toBeNull();
    expect(validateReset("123", "123")).toBe("errLen");
    expect(validateReset("secret1", "autre12")).toBe("errMatch");
  });

  it("tokenFromSearch : extrait ?token=", () => {
    expect(tokenFromSearch("?token=abc123")).toBe("abc123");
    expect(tokenFromSearch("?foo=1")).toBe("");
    expect(tokenFromSearch("")).toBe("");
  });
});

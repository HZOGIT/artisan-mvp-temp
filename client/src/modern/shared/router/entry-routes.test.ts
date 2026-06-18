import { describe, expect, it } from "vitest";
import { resolveEntryRoute } from "./entry-routes";

describe("resolveEntryRoute — routeur d'entrée (pur, sans préfixe /v2)", () => {
  it("racine `/` → redirection vers /home (query préservée)", () => {
    expect(resolveEntryRoute("/")).toEqual({ kind: "redirect", to: "/home" });
    expect(resolveEntryRoute("/", "?ref=x")).toEqual({ kind: "redirect", to: "/home?ref=x" });
  });
  it("pages publiques (auth/légales/paiement/contact) → public", () => {
    expect(resolveEntryRoute("/signin").kind).toBe("public");
    expect(resolveEntryRoute("/cgv").kind).toBe("public");
    expect(resolveEntryRoute("/home").kind).toBe("public");
    expect(resolveEntryRoute("/paiement/succes").kind).toBe("public");
  });
  it("pages publiques à paramètre (token/slug) → public", () => {
    expect(resolveEntryRoute("/signature/tok").kind).toBe("public");
    expect(resolveEntryRoute("/portail/tok123").kind).toBe("public");
    expect(resolveEntryRoute("/vitrine/mon-artisan").kind).toBe("public");
    expect(resolveEntryRoute("/avis/xyz").kind).toBe("public");
  });
  it("tout le reste = authentifié", () => {
    expect(resolveEntryRoute("/dashboard").kind).toBe("auth");
    expect(resolveEntryRoute("/clients").kind).toBe("auth");
    expect(resolveEntryRoute("/factures/123").kind).toBe("auth");
    expect(resolveEntryRoute("/route-inconnue").kind).toBe("auth");
  });
});

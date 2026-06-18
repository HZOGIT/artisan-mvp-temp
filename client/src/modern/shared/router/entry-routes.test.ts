import { describe, expect, it } from "vitest";
import { resolveEntryRoute } from "./entry-routes";

describe("resolveEntryRoute — routeur d'entrée (pur)", () => {
  it("redirections legacy exactes → /v2 (+ query préservée)", () => {
    expect(resolveEntryRoute("/")).toEqual({ kind: "redirect", to: "/v2/home" });
    expect(resolveEntryRoute("/signin")).toEqual({ kind: "redirect", to: "/v2/signin" });
    expect(resolveEntryRoute("/cgv")).toEqual({ kind: "redirect", to: "/v2/cgv" });
    expect(resolveEntryRoute("/paiement/succes", "?session_id=x")).toEqual({ kind: "redirect", to: "/v2/paiement/succes?session_id=x" });
  });
  it("redirections à paramètre (token/slug) → /v2/...", () => {
    expect(resolveEntryRoute("/signature/abc")).toEqual({ kind: "redirect", to: "/v2/signature/abc" });
    expect(resolveEntryRoute("/portail/tok123", "?paiement=succes")).toEqual({ kind: "redirect", to: "/v2/portail/tok123?paiement=succes" });
    expect(resolveEntryRoute("/vitrine/mon-artisan")).toEqual({ kind: "redirect", to: "/v2/vitrine/mon-artisan" });
    expect(resolveEntryRoute("/avis/xyz")).toEqual({ kind: "redirect", to: "/v2/avis/xyz" });
  });
  it("pages /v2 publiques (exactes + à paramètre) → public", () => {
    expect(resolveEntryRoute("/v2/cgv").kind).toBe("public");
    expect(resolveEntryRoute("/v2/signin").kind).toBe("public");
    expect(resolveEntryRoute("/v2/home").kind).toBe("public");
    expect(resolveEntryRoute("/v2/signature/tok").kind).toBe("public");
    expect(resolveEntryRoute("/v2/vitrine/slug").kind).toBe("public");
  });
  it("tout le reste = authentifié", () => {
    expect(resolveEntryRoute("/v2/dashboard").kind).toBe("auth");
    expect(resolveEntryRoute("/v2/clients").kind).toBe("auth");
    expect(resolveEntryRoute("/dashboard").kind).toBe("auth"); // redirigé ensuite par AuthenticatedRoutes
    expect(resolveEntryRoute("/route-inconnue").kind).toBe("auth");
  });
});

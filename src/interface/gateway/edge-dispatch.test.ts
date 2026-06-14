import { describe, it, expect } from "vitest";
import { MIGRATED_DOMAINS } from "./migrated-domains";
// @ts-ignore — module ESM de la Pages Function (JS pur, sans types). Importé pour verrouiller la
// parité avec le gateway src (anti-drift) : la logique edge réimplémente la décision en JS.
import { MIGRATED as EDGE_MIGRATED, decideTarget, domainFromTrpcPath } from "../../../functions/_lib/dispatch.mjs";

// La Pages Function `functions/api/[[path]].js` ne peut pas importer src/** (JS pur, pas de build TS).
// Elle réimplémente la décision de dispatch dans `functions/_lib/dispatch.mjs`. Ce test garantit que
// cette réimplémentation reste alignée sur le registre + la sémantique du gateway clean-archi.

describe("edge dispatch (functions/_lib/dispatch.mjs) — parité avec le gateway src", () => {
  it("la table MIGRATED de l'edge == MIGRATED_DOMAINS (même ensemble + cardinalité)", () => {
    expect(new Set(EDGE_MIGRATED)).toEqual(new Set(MIGRATED_DOMAINS));
    expect(EDGE_MIGRATED.length).toBe(MIGRATED_DOMAINS.length);
  });

  it("domainFromTrpcPath extrait le domaine ; null hors /api/trpc", () => {
    expect(domainFromTrpcPath("/api/trpc/articles.list")).toBe("articles");
    expect(domainFromTrpcPath("/api/trpc/clients.getById")).toBe("clients");
    expect(domainFromTrpcPath("/api/auth/login")).toBeNull();
    expect(domainFromTrpcPath("/")).toBeNull();
  });

  it("OFF par défaut : un domaine migré part en legacy ; activé via NEW_STACK_DOMAINS → new-stack", () => {
    const d = MIGRATED_DOMAINS[0];
    expect(decideTarget(`/api/trpc/${d}.list`, {})).toBe("legacy");
    expect(decideTarget(`/api/trpc/${d}.list`, { NEW_STACK_DOMAINS: d })).toBe("new-stack");
  });

  it("domaine non porté → legacy même si listé (sûreté)", () => {
    expect(decideTarget("/api/trpc/support.list", { NEW_STACK_DOMAINS: "support" })).toBe("legacy");
  });

  it("hors-tRPC → legacy (auth, webhooks, front)", () => {
    const env = { NEW_STACK_DOMAINS: MIGRATED_DOMAINS[0] };
    expect(decideTarget("/api/auth/login", env)).toBe("legacy");
    expect(decideTarget("/api/webhooks/stripe", env)).toBe("legacy");
    expect(decideTarget("/", env)).toBe("legacy");
  });

  it("isolation : activer un domaine n'en détourne pas un autre", () => {
    const env = { NEW_STACK_DOMAINS: "articles" };
    expect(decideTarget("/api/trpc/articles.list", env)).toBe("new-stack");
    expect(decideTarget("/api/trpc/clients.list", env)).toBe("legacy");
  });
});

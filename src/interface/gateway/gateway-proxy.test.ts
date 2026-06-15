import { describe, it, expect } from "vitest";
import { targetForUrl } from "./gateway-proxy";
import { MIGRATED_DOMAINS } from "./migrated-domains";

// `targetForUrl` est la décision pure du front-door (sans réseau) : `local` = servi par le nouveau
// stack (domaine migré ET activé par flag global), `legacy` = proxifié. Décision par flag global
// (tenantId indéfini). On passe un env explicite pour ne pas dépendre du process.
const MIGRE = MIGRATED_DOMAINS[0]; // "vehicules"

describe("targetForUrl (décision du front-door, pure)", () => {
  it("OFF par défaut : un domaine migré part en legacy sans flag", () => {
    expect(targetForUrl(`/api/trpc/${MIGRE}.list`, {} as NodeJS.ProcessEnv)).toBe("legacy");
  });

  it("domaine migré activé par NEW_STACK_DOMAINS → local", () => {
    const env = { NEW_STACK_DOMAINS: MIGRE } as NodeJS.ProcessEnv;
    expect(targetForUrl(`/api/trpc/${MIGRE}.list`, env)).toBe("local");
    expect(targetForUrl(`/api/trpc/${MIGRE}.create?x=1`, env)).toBe("local"); // querystring ignorée
  });

  it("domaine NON migré → legacy même si activé (sûreté)", () => {
    expect(targetForUrl("/api/trpc/interventionsMobile.list", { NEW_STACK_DOMAINS: "interventionsMobile" } as NodeJS.ProcessEnv)).toBe("legacy");
  });

  it("activer un domaine ne détourne pas un autre (pas de fuite)", () => {
    const env = { NEW_STACK_DOMAINS: "articles" } as NodeJS.ProcessEnv;
    expect(targetForUrl("/api/trpc/articles.list", env)).toBe("local");
    expect(targetForUrl("/api/trpc/clients.list", env)).toBe("legacy");
  });

  it("tout le hors-tRPC part en legacy (auth, webhooks, uploads, front résiduel)", () => {
    const env = { NEW_STACK_DOMAINS: MIGRE } as NodeJS.ProcessEnv;
    expect(targetForUrl("/api/auth/login", env)).toBe("legacy");
    expect(targetForUrl("/api/webhooks/stripe", env)).toBe("legacy");
    expect(targetForUrl("/", env)).toBe("legacy");
  });

  it("/health reste local (sonde du conteneur nouveau stack)", () => {
    expect(targetForUrl("/health", {} as NodeJS.ProcessEnv)).toBe("local");
  });
});

import { describe, it, expect } from "vitest";
import { shouldRouteToNewStack, domainFromTrpcPath } from "./router-decision";
import { parseFlagsFromEnv, NO_FLAGS, type FeatureFlags } from "./flags";

describe("shouldRouteToNewStack", () => {
  it("OFF par défaut : aucun flag → legacy", () => {
    expect(shouldRouteToNewStack("vehicules", 1, NO_FLAGS)).toBe(false);
    expect(shouldRouteToNewStack("factures", undefined, NO_FLAGS)).toBe(false);
  });

  it("flag enabled global → nouveau stack pour tous les tenants", () => {
    const flags: FeatureFlags = { vehicules: { enabled: true } };
    expect(shouldRouteToNewStack("vehicules", 1, flags)).toBe(true);
    expect(shouldRouteToNewStack("vehicules", 999, flags)).toBe(true);
    // un autre domaine reste legacy
    expect(shouldRouteToNewStack("factures", 1, flags)).toBe(false);
  });

  it("canary : allowlist tenant active le nouveau stack même si enabled=false", () => {
    const flags: FeatureFlags = { vehicules: { enabled: false, tenantAllowlist: [12, 34] } };
    expect(shouldRouteToNewStack("vehicules", 12, flags)).toBe(true);
    expect(shouldRouteToNewStack("vehicules", 99, flags)).toBe(false);
    expect(shouldRouteToNewStack("vehicules", undefined, flags)).toBe(false);
  });

  it("denylist : rollback ciblé prioritaire sur enabled global", () => {
    const flags: FeatureFlags = { vehicules: { enabled: true, tenantDenylist: [7] } };
    expect(shouldRouteToNewStack("vehicules", 7, flags)).toBe(false);
    expect(shouldRouteToNewStack("vehicules", 8, flags)).toBe(true);
  });
});

describe("domainFromTrpcPath", () => {
  it("extrait le domaine du chemin tRPC", () => {
    expect(domainFromTrpcPath("vehicules.list")).toBe("vehicules");
    expect(domainFromTrpcPath("/factures.getById")).toBe("factures");
  });
  it("null si pas de préfixe de domaine", () => {
    expect(domainFromTrpcPath("health")).toBeNull();
    expect(domainFromTrpcPath(".list")).toBeNull();
    expect(domainFromTrpcPath("")).toBeNull();
  });
});

describe("parseFlagsFromEnv", () => {
  it("NEW_STACK_DOMAINS → domaines enabled globalement", () => {
    const flags = parseFlagsFromEnv({ NEW_STACK_DOMAINS: "vehicules, badges" } as NodeJS.ProcessEnv);
    expect(flags.vehicules).toEqual({ enabled: true });
    expect(flags.badges).toEqual({ enabled: true });
    expect(flags.factures).toBeUndefined();
  });

  it("NEW_STACK_CANARY_<DOMAINE> → allowlist tenants", () => {
    const flags = parseFlagsFromEnv({ NEW_STACK_CANARY_VEHICULES: "12, 34" } as NodeJS.ProcessEnv);
    expect(flags.vehicules?.tenantAllowlist).toEqual([12, 34]);
    expect(flags.vehicules?.enabled).toBe(false);
  });

  it("env vide → aucun flag", () => {
    expect(parseFlagsFromEnv({} as NodeJS.ProcessEnv)).toEqual({});
  });
});

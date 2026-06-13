import { describe, it, expect } from "vitest";
import { shouldRouteToNewStack, domainFromTrpcPath } from "./router-decision";
import { parseFlagsFromEnv, NO_FLAGS, type FeatureFlags } from "./flags";
import { MIGRATED_DOMAINS, isMigratedDomainAvailable } from "./migrated-domains";

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

describe("bascule du domaine avis (flag gateway)", () => {
  it("avis routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    // OFF par défaut
    expect(shouldRouteToNewStack("avis", 5, NO_FLAGS)).toBe(false);
    // canary : seul le tenant allowlisté bascule
    const canary: FeatureFlags = { avis: { enabled: false, tenantAllowlist: [5] } };
    expect(shouldRouteToNewStack("avis", 5, canary)).toBe(true);
    expect(shouldRouteToNewStack("avis", 6, canary)).toBe(false);
    // global enabled + rollback ciblé prioritaire
    const global: FeatureFlags = { avis: { enabled: true, tenantDenylist: [9] } };
    expect(shouldRouteToNewStack("avis", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("avis", 9, global)).toBe(false);
  });

  it("le chemin tRPC du workflow avis extrait bien le domaine", () => {
    expect(domainFromTrpcPath("avis.envoyerDemandeParClient")).toBe("avis");
    expect(domainFromTrpcPath("/avis.moderer")).toBe("avis");
  });

  it("parse env : avis enabled + canary", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "vehicules,avis" } as NodeJS.ProcessEnv).avis).toEqual({ enabled: true });
    expect(parseFlagsFromEnv({ NEW_STACK_CANARY_AVIS: "5,5" } as NodeJS.ProcessEnv).avis?.tenantAllowlist).toEqual([5, 5]);
  });
});

describe("bascule du domaine badges (flag gateway)", () => {
  it("badges routable vers le nouveau stack via flag (canary + enabled + denylist)", () => {
    expect(shouldRouteToNewStack("badges", 7, NO_FLAGS)).toBe(false);
    const canary: FeatureFlags = { badges: { enabled: false, tenantAllowlist: [7] } };
    expect(shouldRouteToNewStack("badges", 7, canary)).toBe(true);
    expect(shouldRouteToNewStack("badges", 8, canary)).toBe(false);
    const global: FeatureFlags = { badges: { enabled: true, tenantDenylist: [3] } };
    expect(shouldRouteToNewStack("badges", 1, global)).toBe(true);
    expect(shouldRouteToNewStack("badges", 3, global)).toBe(false);
  });

  it("les chemins tRPC du domaine badges extraient bien le domaine", () => {
    expect(domainFromTrpcPath("badges.attribuerBadge")).toBe("badges");
    expect(domainFromTrpcPath("/badges.calculerClassement")).toBe("badges");
  });

  it("parse env : badges enabled + canary", () => {
    expect(parseFlagsFromEnv({ NEW_STACK_DOMAINS: "badges" } as NodeJS.ProcessEnv).badges).toEqual({ enabled: true });
    expect(parseFlagsFromEnv({ NEW_STACK_CANARY_BADGES: "7" } as NodeJS.ProcessEnv).badges?.tenantAllowlist).toEqual([7]);
  });
});

describe("registre des domaines migrés", () => {
  it("avis/vehicules/badges sont éligibles à la bascule, pas un domaine non porté", () => {
    expect(MIGRATED_DOMAINS).toContain("avis");
    expect(MIGRATED_DOMAINS).toContain("vehicules");
    expect(MIGRATED_DOMAINS).toContain("badges");
    expect(isMigratedDomainAvailable("badges")).toBe(true);
    expect(isMigratedDomainAvailable("factures")).toBe(false);
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

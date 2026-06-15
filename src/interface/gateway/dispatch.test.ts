import { describe, it, expect } from "vitest";
import { resolveDispatchTarget, resolveBatchDispatchTarget, dispatchesToNewStack } from "./dispatch";
import { NO_FLAGS, type FeatureFlags } from "./flags";
import { MIGRATED_DOMAINS } from "./migrated-domains";

// Un domaine réellement porté par le nouveau stack (1er du registre) pour les cas nominaux.
const MIGRE = MIGRATED_DOMAINS[0]; // ex. "vehicules"
const MIGRE2 = MIGRATED_DOMAINS[1]; // ex. "avis"

describe("resolveDispatchTarget (décision de dispatch legacy↔nouveau stack)", () => {
  it("OFF par défaut : un domaine porté part en legacy tant qu'aucun flag ne l'active", () => {
    expect(resolveDispatchTarget(`${MIGRE}.list`, 1, NO_FLAGS)).toBe("legacy");
  });

  it("domaine porté + flag enabled → new-stack", () => {
    const flags: FeatureFlags = { [MIGRE]: { enabled: true } };
    expect(resolveDispatchTarget(`${MIGRE}.list`, 1, flags)).toBe("new-stack");
    expect(dispatchesToNewStack(`${MIGRE}.list`, 1, flags)).toBe(true);
  });

  it("canary : tenant autorisé → new-stack, autre tenant → legacy", () => {
    const flags: FeatureFlags = { [MIGRE]: { enabled: false, tenantAllowlist: [7] } };
    expect(resolveDispatchTarget(`${MIGRE}.create`, 7, flags)).toBe("new-stack");
    expect(resolveDispatchTarget(`${MIGRE}.create`, 8, flags)).toBe("legacy");
  });

  it("denylist : rollback ciblé d'un tenant même si enabled global → legacy", () => {
    const flags: FeatureFlags = { [MIGRE]: { enabled: true, tenantDenylist: [3] } };
    expect(resolveDispatchTarget(`${MIGRE}.list`, 1, flags)).toBe("new-stack");
    expect(resolveDispatchTarget(`${MIGRE}.list`, 3, flags)).toBe("legacy");
  });

  it("domaine NON porté par le nouveau stack → legacy même si un flag l'active (sûreté)", () => {
    const flags: FeatureFlags = { devices: { enabled: true } };
    expect(resolveDispatchTarget("devices.list", 1, flags)).toBe("legacy");
  });

  it("chemin sans préfixe de domaine (health/whoami/racine) → legacy", () => {
    const flags: FeatureFlags = { [MIGRE]: { enabled: true } };
    expect(resolveDispatchTarget("health", 1, flags)).toBe("legacy");
    expect(resolveDispatchTarget("whoami", 1, flags)).toBe("legacy");
    expect(resolveDispatchTarget("", 1, flags)).toBe("legacy");
  });

  it("préfixe « / » initial toléré (comme domainFromTrpcPath)", () => {
    const flags: FeatureFlags = { [MIGRE]: { enabled: true } };
    expect(resolveDispatchTarget(`/${MIGRE}.getById`, 1, flags)).toBe("new-stack");
  });

  it("tenantId indéfini : enabled global s'applique ; canary (sans tenant) reste legacy", () => {
    expect(resolveDispatchTarget(`${MIGRE}.list`, undefined, { [MIGRE]: { enabled: true } })).toBe("new-stack");
    expect(resolveDispatchTarget(`${MIGRE}.list`, undefined, { [MIGRE]: { enabled: false, tenantAllowlist: [7] } })).toBe("legacy");
  });

  // INVARIANT d'isolation des flags : activer UN domaine ne doit JAMAIS détourner un autre domaine
  // vers le nouveau stack (pas de fuite cross-domaine du flag). Vérifié sur les 30 domaines.
  it("activer un domaine ne route que ce domaine vers le nouveau stack (zéro fuite cross-domaine)", () => {
    for (const d of MIGRATED_DOMAINS) {
      const flags: FeatureFlags = { [d]: { enabled: true } };
      expect(resolveDispatchTarget(`${d}.list`, 1, flags)).toBe("new-stack");
      // tous les AUTRES domaines restent en legacy avec ce flag isolé
      for (const autre of MIGRATED_DOMAINS) {
        if (autre === d) continue;
        expect(resolveDispatchTarget(`${autre}.list`, 1, flags)).toBe("legacy");
      }
    }
  });
});

describe("resolveBatchDispatchTarget (décision batch-aware, httpBatchLink)", () => {
  it("batch mono-domaine activé → new-stack", () => {
    const flags: FeatureFlags = { [MIGRE]: { enabled: true } };
    expect(resolveBatchDispatchTarget(`${MIGRE}.list`, 1, flags)).toBe("new-stack");
  });

  it("batch entièrement activé (tous les domaines ON) → new-stack", () => {
    const flags: FeatureFlags = { [MIGRE]: { enabled: true }, [MIGRE2]: { enabled: true } };
    expect(resolveBatchDispatchTarget(`${MIGRE}.list,${MIGRE2}.getById`, 1, flags)).toBe("new-stack");
  });

  it("batch mixte (un domaine ON + un domaine OFF) → legacy (le legacy sert tout)", () => {
    const flags: FeatureFlags = { [MIGRE]: { enabled: true } }; // MIGRE2 non activé
    expect(resolveBatchDispatchTarget(`${MIGRE}.list,${MIGRE2}.getById`, 1, flags)).toBe("legacy");
  });

  it("batch avec un domaine NON porté par le nouveau stack → legacy", () => {
    const flags: FeatureFlags = { [MIGRE]: { enabled: true }, devices: { enabled: true } };
    expect(resolveBatchDispatchTarget(`${MIGRE}.list,devices.list`, 1, flags)).toBe("legacy");
  });

  it("chemin sans domaine (health/whoami) → legacy", () => {
    expect(resolveBatchDispatchTarget("health", 1, { [MIGRE]: { enabled: true } })).toBe("legacy");
  });
});

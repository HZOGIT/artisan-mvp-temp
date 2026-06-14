import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app";
import { MIGRATED_DOMAINS } from "./gateway/migrated-domains";
import { shouldRouteToNewStack, domainFromTrpcPath } from "./gateway/router-decision";
import type { FeatureFlags } from "./gateway/flags";

// buildApp() (introspection du routeur racine) construit les repos Drizzle par défaut → nécessite une
// URL de base. Sans DB, on skippe proprement plutôt que de planter la collecte.
const HAS_DB = !!(process.env.APP_DATABASE_URL || process.env.DATABASE_URL);

// Garde-fou anti-drift : le registre `MIGRATED_DOMAINS` (utilisé par le gateway pour décider de la
// bascule), les domaines réellement montés dans `createAppRouter` (introspectés sur le routeur racine
// décoré par `buildApp`) et le décompte attendu doivent rester synchronisés. Si un domaine est ajouté
// au routeur sans l'inscrire au registre (ou l'inverse), ces assertions échouent.

// Procédures racine qui ne correspondent PAS à un domaine migré (utilitaires transverses).
const NON_DOMAINE = new Set(["health", "whoami"]);

describe.skipIf(!HAS_DB)("cohérence du registre des domaines migrés (anti-drift)", () => {
  let app: ReturnType<typeof buildApp>;
  let mounted: Set<string>;
  beforeAll(() => {
    app = buildApp();
    // Le routeur racine assemblé est décoré sur l'instance Fastify (cf. buildApp).
    const appRouter = (app as unknown as { appRouter: { _def: { record: Record<string, unknown> } } }).appRouter;
    // Préfixe (avant le 1er « . ») de chaque clé de procédure → nom de domaine monté.
    mounted = new Set(
      Object.keys(appRouter._def.record)
        .map((k) => k.split(".")[0])
        .filter((d) => !NON_DOMAINE.has(d)),
    );
  });
  afterAll(() => app?.close());

  it("chaque domaine de MIGRATED_DOMAINS est réellement monté dans createAppRouter", () => {
    for (const d of MIGRATED_DOMAINS) expect(mounted.has(d)).toBe(true);
  });

  it("chaque domaine monté (hors health/whoami) figure dans MIGRATED_DOMAINS", () => {
    const registre = new Set<string>(MIGRATED_DOMAINS);
    for (const d of mounted) expect(registre.has(d)).toBe(true);
  });

  it("les deux ensembles ont exactement la même cardinalité (30 CRUD + nouveaux routeurs migrés)", () => {
    expect(mounted.size).toBe(MIGRATED_DOMAINS.length);
    // 30 domaines CRUD initiaux + routeurs legacy migrés depuis (artisan, …).
    expect(MIGRATED_DOMAINS.length).toBe(36);
  });

  // Garde-fou générique (sans liste codée en dur, contrairement aux `describe` par domaine de
  // gateway.test) : tout domaine migré doit être pilotable par le gateway — OFF par défaut, ON via
  // flag enabled, et son préfixe extractible d'un chemin tRPC. Détecte un domaine ajouté au registre
  // mais oublié dans la mécanique de bascule.
  it("chaque domaine migré est pilotable par le gateway (OFF par défaut, ON via flag, chemin extractible)", () => {
    for (const domain of MIGRATED_DOMAINS) {
      expect(shouldRouteToNewStack(domain, 1, {})).toBe(false); // OFF par défaut → legacy
      const enabled: FeatureFlags = { [domain]: { enabled: true } };
      expect(shouldRouteToNewStack(domain, 1, enabled)).toBe(true); // bascule globale
      const canary: FeatureFlags = { [domain]: { enabled: false, tenantAllowlist: [7] } };
      expect(shouldRouteToNewStack(domain, 7, canary)).toBe(true); // canary tenant autorisé
      expect(shouldRouteToNewStack(domain, 8, canary)).toBe(false); // canary tenant non listé
      expect(domainFromTrpcPath(`${domain}.list`)).toBe(domain); // préfixe extractible
    }
  });
});

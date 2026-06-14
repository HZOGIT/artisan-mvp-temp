import { MIGRATED_DOMAINS } from "./migrated-domains";

// Modèle de feature flags du gateway : par domaine, avec canary par tenant.
// La SOURCE des flags (env / table DB lue par le gateway) est branchée en R0.19 ;
// ici on définit seulement le type + un parseur env simple pour démarrer.

// Les noms de variables d'env (`NEW_STACK_CANARY_<DOMAINE>`) ne portent pas la casse du domaine.
// On recanonicalise le suffixe (insensible à la casse) vers le nom réel du domaine via le registre,
// pour que le canary fonctionne aussi pour les domaines camelCase (budgetsCategories, notesDeFrais…).
const DOMAINE_PAR_CLE_MINUSCULE = new Map<string, string>(MIGRATED_DOMAINS.map((d) => [d.toLowerCase(), d]));

export interface DomainFlag {
  // Activé globalement pour ce domaine (tous les tenants).
  readonly enabled: boolean;
  // Canary : tenants pour qui le nouveau stack est activé même si enabled=false.
  readonly tenantAllowlist?: readonly number[];
  // Tenants exclus du nouveau stack même si enabled=true (rollback ciblé).
  readonly tenantDenylist?: readonly number[];
}

export type FeatureFlags = Readonly<Record<string, DomainFlag | undefined>>;

export const NO_FLAGS: FeatureFlags = Object.freeze({});

// Parseur env minimal (R0.19 le remplacera/complétera par une source table) :
//   NEW_STACK_DOMAINS="vehicules,badges"            → ces domaines enabled globalement
//   NEW_STACK_CANARY_<DOMAINE>="12,34"              → allowlist tenants pour <domaine>
export function parseFlagsFromEnv(env: NodeJS.ProcessEnv = process.env): FeatureFlags {
  const flags: Record<string, DomainFlag> = {};
  const enabled = (env.NEW_STACK_DOMAINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const domain of enabled) {
    flags[domain] = { enabled: true };
  }
  const prefix = "NEW_STACK_CANARY_";
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith(prefix) || !value) continue;
    const suffixe = key.slice(prefix.length).toLowerCase();
    // Recanonicalisation via le registre (camelCase) ; repli sur le suffixe minuscule si inconnu.
    const domain = DOMAINE_PAR_CLE_MINUSCULE.get(suffixe) ?? suffixe;
    const tenants = value
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n));
    flags[domain] = { enabled: flags[domain]?.enabled ?? false, tenantAllowlist: tenants };
  }
  return Object.freeze(flags);
}

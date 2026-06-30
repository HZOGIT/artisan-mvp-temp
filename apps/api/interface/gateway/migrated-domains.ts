import type { ModuleRouterKeys } from "../trpc/router";

/*
 * Registre des domaines effectivement portés sur le nouveau stack (clean-archi) et
 * montés dans `createAppRouter`. Sert de garde-fou pour la bascule : un flag ne devrait
 * cibler qu'un domaine présent ici (sinon le routage enverrait vers un domaine inexistant
 * du nouveau stack). Mis à jour à chaque domaine livré (étape 9/9 du gabarit).
 */
export const MIGRATED_DOMAINS = ["vehicules", "avis", "badges", "techniciens", "notifications", "fournisseurs", "commandesFournisseurs", "stocks", "clients", "interventions", "conges", "notesDeFrais", "chantiers", "depenses", "devis", "factures", "ecritures", "articles", "parametres", "modelesEmail", "modelesDevis", "configRelances", "rdv", "relances", "categoriesDepenses", "contrats", "demandesContact", "budgetsCategories", "reglesCategorisation", "previsions", "artisan", "devisOptions", "activites", "modules", "statistiques", "calendrier", "emails", "search", "geolocalisation", "dashboard", "rapports", "utilisateurs", "comptabilite", "auth", "subscription", "billing", "signature", "conseilsIA", "assistant", "chat", "support", "devices", "alertesPrevisions", "importErp", "interventionsMobile", "vitrine", "clientPortal", "integrationsComptables", "devisIA", "platformAdmin", "events", "einvoicing", "feedback", "piecesJointes", "connect"] as const;

export type MigratedDomain = (typeof MIGRATED_DOMAINS)[number];

/** Le domaine est-il monté dans le nouveau stack (donc éligible à une bascule de flag) ? */
export function isMigratedDomainAvailable(domain: string): domain is MigratedDomain {
  return (MIGRATED_DOMAINS as readonly string[]).includes(domain);
}

/**
 * Garde de cohérence compilée (sans DB) : MIGRATED_DOMAINS doit couvrir exactement les clés
 * de `moduleRouters` + `vehicules` (monté inline). Si un module est ajouté à `router.ts`
 * sans être inscrit ici, `pnpm check` échoue avec "not assignable to type 'never'".
 */
type _DomainsEqRouterKeys = [(typeof MIGRATED_DOMAINS)[number]] extends [ModuleRouterKeys | "vehicules"]
  ? [ModuleRouterKeys | "vehicules"] extends [(typeof MIGRATED_DOMAINS)[number]]
    ? true
    : never
  : never;
/** @internal échoue à la compilation si MIGRATED_DOMAINS diverge de moduleRouters + vehicules */
export const _assertDomains: _DomainsEqRouterKeys = true;

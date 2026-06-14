// Registre des domaines effectivement portés sur le nouveau stack (clean-archi) et
// montés dans `createAppRouter`. Sert de garde-fou pour la bascule : un flag ne devrait
// cibler qu'un domaine présent ici (sinon le routage enverrait vers un domaine inexistant
// du nouveau stack). Mis à jour à chaque domaine livré (étape 9/9 du gabarit).
export const MIGRATED_DOMAINS = ["vehicules", "avis", "badges", "techniciens", "notifications", "fournisseurs", "commandesFournisseurs", "stocks", "clients", "interventions", "conges", "notesDeFrais", "chantiers", "depenses", "devis", "factures", "ecritures", "articles", "parametres", "modelesEmail", "modelesDevis", "configRelances", "rdv", "relances", "categoriesDepenses", "contrats", "demandesContact", "budgetsCategories", "reglesCategorisation", "previsions"] as const;

export type MigratedDomain = (typeof MIGRATED_DOMAINS)[number];

// Le domaine est-il monté dans le nouveau stack (donc éligible à une bascule de flag) ?
export function isMigratedDomainAvailable(domain: string): domain is MigratedDomain {
  return (MIGRATED_DOMAINS as readonly string[]).includes(domain);
}

// Domaines servis PAR DÉFAUT par le nouveau stack en STAGING (bascule réelle du trafic). Un domaine
// n'entre ici qu'une fois sa **parité de surface vérifiée** : le nouveau stack expose TOUTES les
// procédures que le client appelle pour ce domaine (`trpc.<domaine>.*`) — sinon un appel client
// tomberait sur une procédure inexistante. Vérification : diff des appels client (`client/src`) vs
// procédures montées (cf. `docs/architecture/refonte-parite-backlog.md` §2). Cette liste est la
// **source de vérité** mirroir-ée par l'edge (`functions/_lib/dispatch.mjs` DEFAULT_ENABLED, verrouillé
// par `edge-dispatch.test.ts`). On l'élargit domaine par domaine au fil de la parité (les autres
// domaines migrés restent servis par le legacy tant que leur parité n'est pas complète).
export const STAGING_NEW_STACK_DEFAULT_DOMAINS = [
  "vehicules",
  "notifications",
  "fournisseurs",
  "parametres",
  "modelesEmail",
  "relances",
  "conges", // parité vérifiée : list/getById/create/update/delete/approuver/refuser/annuler + enAttente ⊇ appels client
  "badges", // parité vérifiée : list/create/getBadgesTechnicien/getClassement/calculerClassement + getObjectifsTechnicien ⊇ appels client
  "stocks", // parité vérifiée : CRUD/adjustQuantity/getMouvements/getLowStock + getEntrant/generateAlerts/getRapportCommande ⊇ appels client
  "techniciens", // parité vérifiée : CRUD/getAll/getLinkableUsers + habilitations(get/add/delete) + getStats ⊇ appels client
] as const;

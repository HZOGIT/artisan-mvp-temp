// Registre des domaines effectivement portés sur le nouveau stack (clean-archi) et
// montés dans `createAppRouter`. Sert de garde-fou pour la bascule : un flag ne devrait
// cibler qu'un domaine présent ici (sinon le routage enverrait vers un domaine inexistant
// du nouveau stack). Mis à jour à chaque domaine livré (étape 9/9 du gabarit).
export const MIGRATED_DOMAINS = ["vehicules", "avis", "badges", "techniciens", "notifications", "fournisseurs", "commandesFournisseurs", "stocks", "clients", "interventions", "conges", "notesDeFrais", "chantiers", "depenses", "devis", "factures", "ecritures", "articles", "parametres", "modelesEmail", "modelesDevis", "configRelances", "rdv", "relances", "categoriesDepenses", "contrats", "demandesContact", "budgetsCategories", "reglesCategorisation", "previsions", "artisan", "devisOptions", "activites", "modules", "statistiques", "calendrier", "emails", "search", "geolocalisation", "dashboard", "rapports", "utilisateurs", "comptabilite"] as const;

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
  "rdv", // parité vérifiée : list(enrichi client)/confirm/refuse/proposeAutreCreneau/getStats/getPendingCount ⊇ appels client (emails best-effort en cours)
  "clients", // parité vérifiée : CRUD/search/getEncours/getEncoursMap + importFromExcel ⊇ appels client
  "factures", // parité vérifiée : list/getById(enrichi lignes+client)/getAvoirsByFacture/getAuditLog/create/update/delete/addLigne/createAvoir/markAsPaid/sendByEmail ⊇ appels client
  "contrats", // parité vérifiée : list/getById/create/update/delete/getAFacturer/getInterventions/createIntervention/updateIntervention/generateFacture ⊇ appels client
  "commandesFournisseurs", // parité vérifiée : CRUD/getLignes/updateStatut/recevoir/setStatutFacturation/getEnRetard/getPerformances/listDevisAcceptes/sendEmail/genererDepuisDevisIA ⊇ appels client
  "devis", // parité vérifiée : CRUD/lignes/getById(enrichi)/transitions/sendByEmail/convertToFacture/duplicate/modeles(4)/relances(2)/getDevisNonSignes/genererLignesIA ⊇ appels client
  "avis", // parité vérifiée : list/getAll/getById/getStats/repondre/moderer/envoyerDemandeParClient + PUBLICS getDemandeInfo/submitAvis (token) ⊇ appels client
  "interventions", // parité vérifiée : CRUD/getMine + équipe(4)/couleurs(2)/assignerTechnicien/getSuggestionsTechniciens(géo) ⊇ appels client
  "chantiers", // parité vérifiée : CRUD + pointages(3)/suivi(4)/phases(4)/interventions-liées(4)/documents(3)/getStatistiques/calculerAvancement ⊇ 16 appels client
  "articles", // parité vérifiée : artisan(get/create/update/delete) + bibliothèque(getBibliotheque/search public + create/update/delete/import admin) + suggererArticlesIA ⊇ 8 appels client
  "previsions", // parité vérifiée : getHistorique/getPrevisions/getComparaison/calculer/getTresoreriePrevisionnelle ⊇ 5 appels client (forecasting)
  "depenses", // parité vérifiée : CRUD + stats/checkDoublons + notes-de-frais(workflow+links) + budgets(set/copier) + categories + regles + indemnitéKm + transactions bancaires(get/ignorer/import/convertir) + FEC export + OCR analyserJustificatif ⊇ 28 appels client
  "artisan", // parité vérifiée : getProfile/updateProfile (profil entreprise du tenant) ⊇ 2 appels client
  "devisOptions", // parité vérifiée : getByDevisId/create/delete/select/convertirEnDevis (variantes de devis) ⊇ 5 appels client
  "activites", // parité vérifiée : list/create/toggleFait/delete (suivi commercial, anti-IDOR FK entité rattachée) ⊇ 4 appels client
  "modules", // parité vérifiée : list/getMine/getOnboardingStatus/toggle/completeOnboarding/skipOnboarding (catalogue global + activation tenant + onboarding/plan) ⊇ 6 appels client
  "statistiques", // parité vérifiée : getDevisStats (agrégats devis du tenant) ⊇ 1 appel client
  "calendrier", // parité vérifiée : getIcalFeed/regenerateIcalFeed (jeton de flux iCal du tenant) ⊇ 2 appels client
  "emails", // parité vérifiée : list (journal d'envois scopé tenant, filtres entité + limite) ⊇ 1 appel client
  "search", // parité vérifiée : global (recherche cross-domaine clients/devis/factures/interventions/fournisseurs) ⊇ 1 appel client
  "geolocalisation", // parité vérifiée : getPositions (techniciens du tenant + dernière position, RGPD lecture seule) ⊇ 1 appel client
  "dashboard", // parité vérifiée : getStats/getRecentActivity/getUpcomingInterventions/getMonthlyCA/getYearlyComparison/getConversionRate/getTopClients/getClientEvolution/getObjectifs/getAlerts (10 agrégats) ⊇ appels client
  "rapports", // parité vérifiée : list/create/delete/toggleFavori/executer (rapports personnalisables, anti-IDOR via RLS) ⊇ 5 appels client
  "utilisateurs", // parité vérifiée : list/invite/updateRole/toggleActif/getPermissions/updatePermissions/resetPermissions (gate utilisateurs.gerer ; tables HORS RLS, scope artisanId explicite) ⊇ 7 appels client
  // NB : `comptabilite` est MONTÉ (dans MIGRATED_DOMAINS) mais **PAS activé ici** : il manque `getFecPreview`
  // (générateur FEC) → parité de surface incomplète. On l'ajoutera quand les 6 procs client seront couvertes.
] as const;

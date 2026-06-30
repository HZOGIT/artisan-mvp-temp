import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
  Outlet,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { DashboardLayoutMount } from "../../shell/ui/dashboard-layout-mount";
import NotFoundPage from "../../features/not-found/ui/not-found-page";

/*
 * Socle de routage du FRONT NEUF (refonte strangler-fig). TanStack Router prend la main sur tout le
 * sous-arbre d'URL racine (cf. `basepath: "/"`). wouter a été retiré.
 * Le routeur est rendu DANS l'arbre React existant (cf. ModernRouterMount), donc il partage déjà les
 * providers du legacy : QueryClient + tRPC (@trpc/react-query) + session/auth + DashboardLayout.
 * Routage par CODE (pas de codegen file-based) pour rester explicite et sans plugin de build.
 */

function RouterPending() {
  const { t } = useTranslation("common");
  return <div className="p-6 text-sm text-muted-foreground">{t("loading")}</div>;
}

function RouterError({ error }: ErrorComponentProps) {
  const { t } = useTranslation("common");
  return (
    <div className="p-6 text-sm text-destructive">
      {t("error")} {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

function RouterNotFound() {
  return <NotFoundPage />;
}

/*
 * Racine NUE (un seul routeur unifié,/F1) : porte l'<Outlet/> commun. Trois zones d'enfants :
 * (1) `appShellRoute` — layout pathless qui rend le SHELL modern (sidebar/topbar/chrome) → routes AUTHENTIFIÉES ;
 * (2) routes PUBLIQUES (paiement/signature/portail/auth/légales/home) montées DIRECTEMENT (hors shell) ;
 * (3) `/onboarding` plein écran (hors shell) + redirection racine `/`→`/home`.
 */
const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: RouterNotFound,
});

/** Redirection de confort : `/` → `/home` (vitrine publique). */
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => { throw redirect({ to: "/home" }); },
});

/** Onboarding plein écran (authentifié mais SANS shell) — port du comportement App.tsx (hors chrome). */
const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  component: lazyRouteComponent(() => import("../../features/onboarding/ui/onboarding-page")),
  validateSearch: (s: Record<string, unknown>) => ({
    plan: typeof s.plan === "string" ? s.plan : undefined,
  }),
});

/*
 * Layout pathless du SHELL modern : rend DashboardLayoutMount (chrome + gate onboarding) autour de l'<Outlet/>.
 * Toutes les routes authentifiées en sont enfants → la chrome persiste entre navigations.
 */
const appShellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app-shell",
  component: DashboardLayoutMount,
});

/** Liste Clients du front neuf — port conforme de `pages/Clients.tsx` (parité visuelle). */
const clientsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/clients",
  component: lazyRouteComponent(() => import("../../features/clients/ui/clients-list-page")),
});

/** Détail client — port conforme de `pages/ClientDetail.tsx` (param de route typé `$id`). */
const clientDetailRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/clients/$id",
  component: lazyRouteComponent(() => import("../../features/clients/ui/client-detail-page")),
});

/** Notifications du front neuf — port conforme de `pages/Notifications.tsx`. */
const notificationsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/notifications",
  component: lazyRouteComponent(() => import("../../features/notifications/ui/notifications-page")),
});

/** Techniciens du front neuf — port conforme de `pages/Techniciens.tsx`. */
const techniciensRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/techniciens",
  component: lazyRouteComponent(() => import("../../features/techniciens/ui/techniciens-page")),
});

/** Fournisseurs du front neuf — port conforme de `pages/Fournisseurs.tsx`. */
const fournisseursRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/fournisseurs",
  component: lazyRouteComponent(() => import("../../features/fournisseurs/ui/fournisseurs-page")),
});

/** Articles (bibliothèque) du front neuf — port conforme de `pages/Articles.tsx`. */
const articlesRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/articles",
  component: lazyRouteComponent(() => import("../../features/articles/ui/articles-page")),
});

/** Devis du front neuf — port conforme de `pages/Devis.tsx`. */
const devisRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/devis",
  component: lazyRouteComponent(() => import("../../features/devis/ui/devis-page")),
});

/** Factures du front neuf — port conforme de `pages/Factures.tsx`. */
const facturesRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/factures",
  component: lazyRouteComponent(() => import("../../features/factures/ui/factures-page")),
});

/** Interventions du front neuf — port conforme de `pages/Interventions.tsx`. */
const interventionsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/interventions",
  component: lazyRouteComponent(() => import("../../features/interventions/ui/interventions-page")),
});

/** Commandes fournisseurs du front neuf — port conforme de `pages/CommandesFournisseurs.tsx`. */
const commandesRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/commandes",
  component: lazyRouteComponent(() => import("../../features/commandes/ui/commandes-page")),
});

/** Stocks du front neuf — port conforme de `pages/Stocks.tsx`. */
const stocksRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/stocks",
  component: lazyRouteComponent(() => import("../../features/stocks/ui/stocks-page")),
});

/** Dépenses du front neuf — port conforme de `pages/Depenses.tsx`. */
const depensesRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/depenses",
  component: lazyRouteComponent(() => import("../../features/depenses/ui/depenses-page")),
});

/** Comptabilité du front neuf — port conforme de `pages/Comptabilite.tsx`. */
const comptabiliteRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/comptabilite",
  component: lazyRouteComponent(() => import("../../features/comptabilite/ui/comptabilite-page")),
});

/** Gestion du Portail Client du front neuf — migration clean-archi de `pages/PortailGestion.tsx`. */
const portailGestionRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/portail-gestion",
  component: lazyRouteComponent(() => import("../../features/portail-gestion/ui/portail-gestion-page")),
});

/** Budgets de dépenses du front neuf — migration clean-archi de `pages/BudgetsDepenses.tsx`. */
const budgetsDepensesRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/budgets-depenses",
  component: lazyRouteComponent(() => import("../../features/budgets-depenses/ui/budgets-depenses-page")),
});

/** Règles de catégorisation des dépenses — migration clean-archi de `pages/ReglesDepenses.tsx`. */
const reglesDepensesRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/regles-depenses",
  component: lazyRouteComponent(() => import("../../features/regles-depenses/ui/regles-depenses-page")),
});

/** Historique des emails — migration clean-archi de `pages/HistoriqueEmails.tsx`. */
const historiqueEmailsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/historique-emails",
  component: lazyRouteComponent(() => import("../../features/historique-emails/ui/historique-emails-page")),
});

/** Centre d'aide / Support — migration clean-archi de `pages/Support.tsx`. */
const supportRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/support",
  component: lazyRouteComponent(() => import("../../features/support/ui/support-page")),
});

/** Avis clients — migration clean-archi de `pages/Avis.tsx`. */
const avisRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/avis",
  component: lazyRouteComponent(() => import("../../features/avis/ui/avis-page")),
});

const chatRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/chat",
  component: lazyRouteComponent(() => import("../../features/chat/ui/chat-page")),
});

const badgesRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/badges",
  component: lazyRouteComponent(() => import("../../features/badges/ui/badges-page")),
});

const classementRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/classement",
  component: lazyRouteComponent(() => import("../../features/classement/ui/classement-page")),
});

const modelesEmailRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/modeles-email",
  component: lazyRouteComponent(() => import("../../features/modeles-email/ui/modeles-email-page")),
});

const modelesTransactionnelsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/modeles-email-transactionnels",
  component: lazyRouteComponent(() => import("../../features/modeles-email-transactionnels/ui/modeles-transactionnels-page")),
});

const assistantConversationsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/assistant/conversations",
  component: lazyRouteComponent(() => import("../../features/assistant-conversations/ui/assistant-conversations-page")),
});

const vehiculesRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/vehicules",
  component: lazyRouteComponent(() => import("../../features/vehicules/ui/vehicules-page")),
});

const rapportCommandeRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/rapport-commande",
  component: lazyRouteComponent(() => import("../../features/rapport-commande/ui/rapport-commande-page")),
});

const rapportsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/rapports",
  component: lazyRouteComponent(() => import("../../features/rapports/ui/rapports-page")),
});

const documentationRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/documentation",
  component: lazyRouteComponent(() => import("../../features/documentation/ui/documentation-page")),
});

const maVitrineRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/ma-vitrine",
  component: lazyRouteComponent(() => import("../../features/ma-vitrine/ui/ma-vitrine-page")),
});

const rdvEnLigneRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/rdv-en-ligne",
  component: lazyRouteComponent(() => import("../../features/rdv-en-ligne/ui/rdv-en-ligne-page")),
});

const alertesPrevisionsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/alertes-previsions",
  component: lazyRouteComponent(() => import("../../features/alertes-previsions/ui/alertes-previsions-page")),
});

const previsionsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/previsions",
  component: lazyRouteComponent(() => import("../../features/previsions/ui/previsions-page")),
});

const performancesFournisseursRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/performances-fournisseurs",
  component: lazyRouteComponent(() => import("../../features/performances-fournisseurs/ui/performances-fournisseurs-page")),
});

const tableauBordDepensesRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/tableau-bord-depenses",
  component: lazyRouteComponent(() => import("../../features/tableau-bord-depenses/ui/tableau-bord-depenses-page")),
});

const importReleveRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/import-releve",
  component: lazyRouteComponent(() => import("../../features/import-releve/ui/import-releve-page")),
});

const rapprochementEncaissementsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/rapprochement-encaissements",
  component: lazyRouteComponent(() => import("../../features/rapprochement-encaissements/ui/rapprochement-page")),
});

const syncComptableRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/tableau-bord-sync-comptable",
  component: lazyRouteComponent(() => import("../../features/tableau-bord-sync-comptable/ui/sync-comptable-page")),
});

const geolocalisationRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/geolocalisation",
  component: lazyRouteComponent(() => import("../../features/geolocalisation/ui/geolocalisation-page")),
});

const planificationRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/planification",
  component: lazyRouteComponent(() => import("../../features/planification/ui/planification-page")),
});

const nouvelleDepenseRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/nouvelle-depense",
  component: lazyRouteComponent(() => import("../../features/nouvelle-depense/ui/nouvelle-depense-page")),
});

const integrationsComptablesRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/integrations-comptables",
  component: lazyRouteComponent(() => import("../../features/integrations-comptables/ui/integrations-comptables-page")),
});

const analysesPhotosRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/analyses-photos",
  component: lazyRouteComponent(() => import("../../features/analyses-photos/ui/analyses-photos-page")),
});

const importRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/import",
  component: lazyRouteComponent(() => import("../../features/import/ui/import-page")),
});

const devisIaRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/devis-ia",
  component: lazyRouteComponent(() => import("../../features/devis-ia/ui/devis-ia-page")),
});

const chantiersRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/chantiers",
  component: lazyRouteComponent(() => import("../../features/chantiers/ui/chantiers-page")),
});

const assistantRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/assistant",
  component: lazyRouteComponent(() => import("../../features/assistant/ui/assistant-page")),
});

const calendrierChantiersRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/calendrier-chantiers",
  component: lazyRouteComponent(() => import("../../features/calendrier-chantiers/ui/calendrier-chantiers-page")),
});



const clientsNouveauRoute = createRoute({ getParentRoute: () => appShellRoute, path: "/clients/nouveau", component: lazyRouteComponent(() => import("../../features/client-form/ui/clients-nouveau-page")) });
const clientsImportRoute = createRoute({ getParentRoute: () => appShellRoute, path: "/clients/import", component: lazyRouteComponent(() => import("../../features/clients-import/ui/clients-import-page")) });
const mobileRoute = createRoute({ getParentRoute: () => appShellRoute, path: "/mobile", component: lazyRouteComponent(() => import("../../features/interventions-mobile/ui/interventions-mobile-page")) });
const commandeDetailRoute = createRoute({ getParentRoute: () => appShellRoute, path: "/commandes/$id", component: lazyRouteComponent(() => import("../../features/commande-detail/ui/commande-detail-page")) });
const contratDetailRoute = createRoute({ getParentRoute: () => appShellRoute, path: "/contrats/$id", component: lazyRouteComponent(() => import("../../features/contrat-detail/ui/contrat-detail-page")) });
const profilRoute = createRoute({ getParentRoute: () => appShellRoute, path: "/profil", component: lazyRouteComponent(() => import("../../features/profil/ui/profil-page")) });
const devisLigneRoute = createRoute({ getParentRoute: () => appShellRoute, path: "/devis/$id/ligne/nouvelle", component: lazyRouteComponent(() => import("../../features/devis-ligne/ui/devis-ligne-page")) });
const devisNouveauRoute = createRoute({ getParentRoute: () => appShellRoute, path: "/devis/nouveau", component: lazyRouteComponent(() => import("../../features/devis-nouveau/ui/devis-nouveau-page")) });
const devisDetailRoute = createRoute({ getParentRoute: () => appShellRoute, path: "/devis/$id", component: lazyRouteComponent(() => import("../../features/devis-detail/ui/devis-detail-page")) });
const factureDetailRoute = createRoute({ getParentRoute: () => appShellRoute, path: "/factures/$id", component: lazyRouteComponent(() => import("../../features/facture-detail/ui/facture-detail-page")) });
const commandeNouvelleRoute = createRoute({ getParentRoute: () => appShellRoute, path: "/commandes/nouvelle", component: lazyRouteComponent(() => import("../../features/commande-form/ui/commande-form-page")) });
const commandeModifierRoute = createRoute({ getParentRoute: () => appShellRoute, path: "/commandes/$id/modifier", component: lazyRouteComponent(() => import("../../features/commande-form/ui/commande-form-page")) });
const eventsAdminRoute = createRoute({ getParentRoute: () => appShellRoute, path: "/events-admin", component: lazyRouteComponent(() => import("../../features/events-admin/ui/events-admin-page")) });
const einvoicingRoute = createRoute({ getParentRoute: () => appShellRoute, path: "/facturation-electronique", component: lazyRouteComponent(() => import("../../features/einvoicing/ui/einvoicing-page")) });

/** Flotte (vue d'ensemble du parc) — migration clean-archi de `pages/Flotte.tsx`. */
const flotteRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/flotte",
  component: lazyRouteComponent(() => import("../../features/flotte/ui/flotte-page")),
});

/** Statistiques Devis — migration clean-archi de `pages/StatistiquesDevis.tsx`. */
const statistiquesRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/statistiques",
  component: lazyRouteComponent(() => import("../../features/statistiques-devis/ui/statistiques-devis-page")),
});

/** Mes modules — migration clean-archi de `pages/Modules.tsx`. */
const modulesRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/modules",
  component: lazyRouteComponent(() => import("../../features/modules/ui/modules-page")),
});

/** Gestion des congés — migration clean-archi de `pages/Conges.tsx`. */
const congesRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/conges",
  component: lazyRouteComponent(() => import("../../features/conges/ui/conges-page")),
});

/** Contrats de maintenance — migration clean-archi de `pages/Contrats.tsx`. */
const contratsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/contrats",
  component: lazyRouteComponent(() => import("../../features/contrats/ui/contrats-page")),
});

/** Relances de devis — migration clean-archi de `pages/RelancesDevis.tsx`. */
const relancesDevisRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/relances",
  component: lazyRouteComponent(() => import("../../features/relances-devis/ui/relances-devis-page")),
});

/** Calendrier des interventions — migration clean-archi de `pages/Calendrier.tsx`. */
const calendrierRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/calendrier",
  component: lazyRouteComponent(() => import("../../features/calendrier/ui/calendrier-page")),
});

/** Gestion des utilisateurs — migration clean-archi de `pages/Utilisateurs.tsx`. */
const utilisateursRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/utilisateurs",
  component: lazyRouteComponent(() => import("../../features/utilisateurs/ui/utilisateurs-page")),
});

/** Variantes de devis (placeholder explicatif) — migration clean-archi de `pages/DevisOptions.tsx`. */
const devisOptionsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/devis-options",
  component: lazyRouteComponent(() => import("../../features/devis-options/ui/devis-options-page")),
});

/*
 * Paramètres — migration clean-archi de `pages/Parametres.tsx` (onglet général + abonnement réutilisé).
 * La sous-section « réglages vitrine » est omise (pas d'endpoint backend — finding).
 */
const parametresRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/parametres",
  component: lazyRouteComponent(() => import("../../features/parametres/ui/parametres-page")),
});

/** Paiements en ligne — onboarding Stripe Connect. */
const paiementsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/paiements",
  component: lazyRouteComponent(() => import("../../features/paiements/ui/paiements-page")),
});

/** Abonnement — page dédiée, séparée de Paramètres. */
const abonnementRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/abonnement",
  component: lazyRouteComponent(() => import("../../features/abonnement/ui/abonnement-page")),
});

/** Tableau de bord — migration clean-archi de `pages/Dashboard.tsx` (thin-shell réutilisant les widgets). */
const dashboardRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/dashboard",
  component: lazyRouteComponent(() => import("../../features/dashboard/ui/dashboard-page")),
});

/** Notes de frais — migration clean-archi de `pages/NotesFrais.tsx` (débloquée par backend). */
const notesFraisRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: "/notes-de-frais",
  component: lazyRouteComponent(() => import("../../features/notes-frais/ui/notes-frais-page")),
});

/*
 * ============================================================================
 * Routes PUBLIQUES (hors auth/shell) — fusionnées depuis l'ancien public-router.tsx.
 * Montées directement sous la racine NUE (pas de chrome). Paiement/signature/portail/avis/vitrine par
 * token/slug, pages auth (visiteur déconnecté), pages légales, home (vitrine).
 * ============================================================================
 */
const paiementSuccesRoute = createRoute({ getParentRoute: () => rootRoute, path: "/paiement/succes", component: lazyRouteComponent(() => import("../../features/paiement/ui/paiement-succes-page")) });
const paiementAnnuleRoute = createRoute({ getParentRoute: () => rootRoute, path: "/paiement/annule", component: lazyRouteComponent(() => import("../../features/paiement/ui/paiement-annule-page")) });
const signatureRoute = createRoute({ getParentRoute: () => rootRoute, path: "/signature/$token", component: lazyRouteComponent(() => import("../../features/signature/ui/signature-devis-page")) });
const devisPublicRoute = createRoute({ getParentRoute: () => rootRoute, path: "/devis-public/$token", component: lazyRouteComponent(() => import("../../features/signature/ui/signature-devis-page")) });
const portailRoute = createRoute({ getParentRoute: () => rootRoute, path: "/portail/$token", component: lazyRouteComponent(() => import("../../features/portail/ui/portail-client-page")) });
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/home", component: lazyRouteComponent(() => import("../../features/home/ui/home-page")) });
const avisPublicRoute = createRoute({ getParentRoute: () => rootRoute, path: "/avis/$token", component: lazyRouteComponent(() => import("../../features/avis-public/ui/soumettre-avis-page")) });
const vitrineRoute = createRoute({ getParentRoute: () => rootRoute, path: "/vitrine/$slug", component: lazyRouteComponent(() => import("../../features/vitrine-public/ui/vitrine-page")) });
const pageConstruction = () => import("../../features/page-construction/ui/page-construction-page");
const contactRoute = createRoute({ getParentRoute: () => rootRoute, path: "/contact", component: lazyRouteComponent(pageConstruction) });
const aideRoute = createRoute({ getParentRoute: () => rootRoute, path: "/aide", component: lazyRouteComponent(pageConstruction) });
const guideRoute = createRoute({ getParentRoute: () => rootRoute, path: "/guide", component: lazyRouteComponent(pageConstruction) });
const authSignInRoute = createRoute({ getParentRoute: () => rootRoute, path: "/signin", component: lazyRouteComponent(() => import("../../features/auth/ui/sign-in-page")) });
const authSignInAliasRoute = createRoute({ getParentRoute: () => rootRoute, path: "/sign-in", component: lazyRouteComponent(() => import("../../features/auth/ui/sign-in-page")) });
const authSignUpRoute = createRoute({ getParentRoute: () => rootRoute, path: "/signup", component: lazyRouteComponent(() => import("../../features/auth/ui/sign-up-page")) });
const authForgotRoute = createRoute({ getParentRoute: () => rootRoute, path: "/forgot-password", component: lazyRouteComponent(() => import("../../features/auth/ui/forgot-password-page")) });
const authResetRoute = createRoute({ getParentRoute: () => rootRoute, path: "/reset-password", component: lazyRouteComponent(() => import("../../features/auth/ui/reset-password-page")) });
const mentionsLegalesRoute = createRoute({ getParentRoute: () => rootRoute, path: "/mentions-legales", component: lazyRouteComponent(() => import("../../features/legal/ui/mentions-legales-page")) });
const cguRoute = createRoute({ getParentRoute: () => rootRoute, path: "/cgu", component: lazyRouteComponent(() => import("../../features/legal/ui/cgu-page")) });
const cgvRoute = createRoute({ getParentRoute: () => rootRoute, path: "/cgv", component: lazyRouteComponent(() => import("../../features/legal/ui/cgv-page")) });
const confidentialiteRoute = createRoute({ getParentRoute: () => rootRoute, path: "/confidentialite", component: lazyRouteComponent(() => import("../../features/legal/ui/confidentialite-page")) });

/** Arbre AUTHENTIFIÉ : toutes les pages sous le shell (chrome persistante). */
const appShellTree = appShellRoute.addChildren([eventsAdminRoute, einvoicingRoute, clientsRoute, clientDetailRoute, notificationsRoute, techniciensRoute, fournisseursRoute, articlesRoute, devisRoute, facturesRoute, interventionsRoute, commandesRoute, stocksRoute, depensesRoute, comptabiliteRoute, portailGestionRoute, budgetsDepensesRoute, reglesDepensesRoute, historiqueEmailsRoute, supportRoute, avisRoute, flotteRoute, statistiquesRoute, modulesRoute, congesRoute, contratsRoute, relancesDevisRoute, calendrierRoute, utilisateursRoute, devisOptionsRoute, parametresRoute, paiementsRoute, abonnementRoute, dashboardRoute, notesFraisRoute, chatRoute, badgesRoute, classementRoute, modelesEmailRoute, modelesTransactionnelsRoute, assistantConversationsRoute, vehiculesRoute, rapportCommandeRoute, rapportsRoute, documentationRoute, maVitrineRoute, rdvEnLigneRoute, alertesPrevisionsRoute, previsionsRoute, performancesFournisseursRoute, tableauBordDepensesRoute, importReleveRoute, rapprochementEncaissementsRoute, syncComptableRoute, geolocalisationRoute, planificationRoute, nouvelleDepenseRoute, integrationsComptablesRoute, analysesPhotosRoute, importRoute, devisIaRoute, chantiersRoute, assistantRoute, calendrierChantiersRoute, clientsNouveauRoute, clientsImportRoute, mobileRoute, commandeDetailRoute, contratDetailRoute, profilRoute, devisLigneRoute, devisNouveauRoute, devisDetailRoute, factureDetailRoute, commandeNouvelleRoute, commandeModifierRoute]);

const routeTree = rootRoute.addChildren([
  appShellTree, indexRoute, onboardingRoute,
  paiementSuccesRoute, paiementAnnuleRoute, signatureRoute, devisPublicRoute, portailRoute, homeRoute, avisPublicRoute, vitrineRoute,
  contactRoute, aideRoute, guideRoute, authSignInRoute, authSignInAliasRoute, authSignUpRoute, authForgotRoute, authResetRoute,
  mentionsLegalesRoute, cguRoute, cgvRoute, confidentialiteRoute,
]);

export const modernRouter = createRouter({
  routeTree,
  basepath: "/",
  defaultPendingComponent: RouterPending,
  defaultErrorComponent: RouterError,
});

/** Type-safety du routeur neuf (liens/navigation typés) sans polluer le legacy. */
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof modernRouter;
  }
}

import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

// Socle de routage du FRONT NEUF (refonte strangler-fig). TanStack Router prend la main sur tout le
// sous-arbre d'URL `/v2/*` (cf. `basepath`) tandis que wouter continue de servir le legacy intact.
// Le routeur est rendu DANS l'arbre React existant (cf. ModernRouterMount), donc il partage déjà les
// providers du legacy : QueryClient + tRPC (@trpc/react-query) + session/auth + DashboardLayout.
// Routage par CODE (pas de codegen file-based) pour rester explicite et sans plugin de build.

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
  const { t } = useTranslation("common");
  return <div className="p-6 text-sm text-muted-foreground">{t("routeNotFound")}</div>;
}

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: RouterNotFound,
});

// Route de démonstration du socle (OPE-415) — prouve montage + lazy + providers partagés.
const pingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ping",
  component: lazyRouteComponent(() => import("../../features/_demo/ping-page")),
});

// Liste Clients du front neuf — port conforme de `pages/Clients.tsx` (parité visuelle).
const clientsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/clients",
  component: lazyRouteComponent(() => import("../../features/clients/ui/clients-list-page")),
});

// Détail client — port conforme de `pages/ClientDetail.tsx` (param de route typé `$id`).
const clientDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/clients/$id",
  component: lazyRouteComponent(() => import("../../features/clients/ui/client-detail-page")),
});

// Notifications du front neuf — port conforme de `pages/Notifications.tsx`.
const notificationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notifications",
  component: lazyRouteComponent(() => import("../../features/notifications/ui/notifications-page")),
});

// Techniciens du front neuf — port conforme de `pages/Techniciens.tsx`.
const techniciensRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/techniciens",
  component: lazyRouteComponent(() => import("../../features/techniciens/ui/techniciens-page")),
});

// Fournisseurs du front neuf — port conforme de `pages/Fournisseurs.tsx`.
const fournisseursRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/fournisseurs",
  component: lazyRouteComponent(() => import("../../features/fournisseurs/ui/fournisseurs-page")),
});

// Articles (bibliothèque) du front neuf — port conforme de `pages/Articles.tsx`.
const articlesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/articles",
  component: lazyRouteComponent(() => import("../../features/articles/ui/articles-page")),
});

// Devis du front neuf — port conforme de `pages/Devis.tsx`.
const devisRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/devis",
  component: lazyRouteComponent(() => import("../../features/devis/ui/devis-page")),
});

// Factures du front neuf — port conforme de `pages/Factures.tsx`.
const facturesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/factures",
  component: lazyRouteComponent(() => import("../../features/factures/ui/factures-page")),
});

// Interventions du front neuf — port conforme de `pages/Interventions.tsx`.
const interventionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/interventions",
  component: lazyRouteComponent(() => import("../../features/interventions/ui/interventions-page")),
});

// Commandes fournisseurs du front neuf — port conforme de `pages/CommandesFournisseurs.tsx`.
const commandesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/commandes",
  component: lazyRouteComponent(() => import("../../features/commandes/ui/commandes-page")),
});

// Stocks du front neuf — port conforme de `pages/Stocks.tsx`.
const stocksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/stocks",
  component: lazyRouteComponent(() => import("../../features/stocks/ui/stocks-page")),
});

// Dépenses du front neuf — port conforme de `pages/Depenses.tsx`.
const depensesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/depenses",
  component: lazyRouteComponent(() => import("../../features/depenses/ui/depenses-page")),
});

// Comptabilité du front neuf — port conforme de `pages/Comptabilite.tsx`.
const comptabiliteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/comptabilite",
  component: lazyRouteComponent(() => import("../../features/comptabilite/ui/comptabilite-page")),
});

// Gestion du Portail Client du front neuf — migration clean-archi de `pages/PortailGestion.tsx`.
const portailGestionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/portail-gestion",
  component: lazyRouteComponent(() => import("../../features/portail-gestion/ui/portail-gestion-page")),
});

// Budgets de dépenses du front neuf — migration clean-archi de `pages/BudgetsDepenses.tsx`.
const budgetsDepensesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/budgets-depenses",
  component: lazyRouteComponent(() => import("../../features/budgets-depenses/ui/budgets-depenses-page")),
});

// Règles de catégorisation des dépenses — migration clean-archi de `pages/ReglesDepenses.tsx`.
const reglesDepensesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/regles-depenses",
  component: lazyRouteComponent(() => import("../../features/regles-depenses/ui/regles-depenses-page")),
});

// Historique des emails — migration clean-archi de `pages/HistoriqueEmails.tsx`.
const historiqueEmailsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/historique-emails",
  component: lazyRouteComponent(() => import("../../features/historique-emails/ui/historique-emails-page")),
});

// Centre d'aide / Support — migration clean-archi de `pages/Support.tsx`.
const supportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/support",
  component: lazyRouteComponent(() => import("../../features/support/ui/support-page")),
});

// Avis clients — migration clean-archi de `pages/Avis.tsx`.
const avisRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/avis",
  component: lazyRouteComponent(() => import("../../features/avis/ui/avis-page")),
});

const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat",
  component: lazyRouteComponent(() => import("../../features/chat/ui/chat-page")),
});

const badgesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/badges",
  component: lazyRouteComponent(() => import("../../features/badges/ui/badges-page")),
});

const classementRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/classement",
  component: lazyRouteComponent(() => import("../../features/classement/ui/classement-page")),
});

const modelesEmailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/modeles-email",
  component: lazyRouteComponent(() => import("../../features/modeles-email/ui/modeles-email-page")),
});

const modelesTransactionnelsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/modeles-email-transactionnels",
  component: lazyRouteComponent(() => import("../../features/modeles-email-transactionnels/ui/modeles-transactionnels-page")),
});

const assistantConversationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/assistant/conversations",
  component: lazyRouteComponent(() => import("../../features/assistant-conversations/ui/assistant-conversations-page")),
});

const vehiculesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/vehicules",
  component: lazyRouteComponent(() => import("../../features/vehicules/ui/vehicules-page")),
});

const rapportCommandeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/rapport-commande",
  component: lazyRouteComponent(() => import("../../features/rapport-commande/ui/rapport-commande-page")),
});

const rapportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/rapports",
  component: lazyRouteComponent(() => import("../../features/rapports/ui/rapports-page")),
});

const documentationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/documentation",
  component: lazyRouteComponent(() => import("../../features/documentation/ui/documentation-page")),
});

const maVitrineRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ma-vitrine",
  component: lazyRouteComponent(() => import("../../features/ma-vitrine/ui/ma-vitrine-page")),
});

const rdvEnLigneRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/rdv-en-ligne",
  component: lazyRouteComponent(() => import("../../features/rdv-en-ligne/ui/rdv-en-ligne-page")),
});

const alertesPrevisionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/alertes-previsions",
  component: lazyRouteComponent(() => import("../../features/alertes-previsions/ui/alertes-previsions-page")),
});

const previsionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/previsions",
  component: lazyRouteComponent(() => import("../../features/previsions/ui/previsions-page")),
});

const performancesFournisseursRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/performances-fournisseurs",
  component: lazyRouteComponent(() => import("../../features/performances-fournisseurs/ui/performances-fournisseurs-page")),
});

const tableauBordDepensesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tableau-bord-depenses",
  component: lazyRouteComponent(() => import("../../features/tableau-bord-depenses/ui/tableau-bord-depenses-page")),
});

const importReleveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/import-releve",
  component: lazyRouteComponent(() => import("../../features/import-releve/ui/import-releve-page")),
});

const syncComptableRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tableau-bord-sync-comptable",
  component: lazyRouteComponent(() => import("../../features/tableau-bord-sync-comptable/ui/sync-comptable-page")),
});

const geolocalisationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/geolocalisation",
  component: lazyRouteComponent(() => import("../../features/geolocalisation/ui/geolocalisation-page")),
});

const planificationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/planification",
  component: lazyRouteComponent(() => import("../../features/planification/ui/planification-page")),
});

const nouvelleDepenseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/nouvelle-depense",
  component: lazyRouteComponent(() => import("../../features/nouvelle-depense/ui/nouvelle-depense-page")),
});

const integrationsComptablesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/integrations-comptables",
  component: lazyRouteComponent(() => import("../../features/integrations-comptables/ui/integrations-comptables-page")),
});

const analysesPhotosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/analyses-photos",
  component: lazyRouteComponent(() => import("../../features/analyses-photos/ui/analyses-photos-page")),
});

const importRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/import",
  component: lazyRouteComponent(() => import("../../features/import/ui/import-page")),
});

const devisIaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/devis-ia",
  component: lazyRouteComponent(() => import("../../features/devis-ia/ui/devis-ia-page")),
});

const chantiersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chantiers",
  component: lazyRouteComponent(() => import("../../features/chantiers/ui/chantiers-page")),
});

const assistantRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/assistant",
  component: lazyRouteComponent(() => import("../../features/assistant/ui/assistant-page")),
});

// Flotte (vue d'ensemble du parc) — migration clean-archi de `pages/Flotte.tsx`.
const flotteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/flotte",
  component: lazyRouteComponent(() => import("../../features/flotte/ui/flotte-page")),
});

// Statistiques Devis — migration clean-archi de `pages/StatistiquesDevis.tsx`.
const statistiquesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/statistiques",
  component: lazyRouteComponent(() => import("../../features/statistiques-devis/ui/statistiques-devis-page")),
});

// Mes modules — migration clean-archi de `pages/Modules.tsx`.
const modulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/modules",
  component: lazyRouteComponent(() => import("../../features/modules/ui/modules-page")),
});

// Gestion des congés — migration clean-archi de `pages/Conges.tsx`.
const congesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/conges",
  component: lazyRouteComponent(() => import("../../features/conges/ui/conges-page")),
});

// Contrats de maintenance — migration clean-archi de `pages/Contrats.tsx`.
const contratsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/contrats",
  component: lazyRouteComponent(() => import("../../features/contrats/ui/contrats-page")),
});

// Relances de devis — migration clean-archi de `pages/RelancesDevis.tsx`.
const relancesDevisRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/relances-devis",
  component: lazyRouteComponent(() => import("../../features/relances-devis/ui/relances-devis-page")),
});

// Calendrier des interventions — migration clean-archi de `pages/Calendrier.tsx`.
const calendrierRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/calendrier",
  component: lazyRouteComponent(() => import("../../features/calendrier/ui/calendrier-page")),
});

// Gestion des utilisateurs — migration clean-archi de `pages/Utilisateurs.tsx`.
const utilisateursRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/utilisateurs",
  component: lazyRouteComponent(() => import("../../features/utilisateurs/ui/utilisateurs-page")),
});

// Variantes de devis (placeholder explicatif) — migration clean-archi de `pages/DevisOptions.tsx`.
const devisOptionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/devis-options",
  component: lazyRouteComponent(() => import("../../features/devis-options/ui/devis-options-page")),
});

// Paramètres — migration clean-archi de `pages/Parametres.tsx` (onglet général + abonnement réutilisé).
// La sous-section « réglages vitrine » est omise (pas d'endpoint backend — finding OPE-504).
const parametresRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/parametres",
  component: lazyRouteComponent(() => import("../../features/parametres/ui/parametres-page")),
});

// Tableau de bord — migration clean-archi de `pages/Dashboard.tsx` (thin-shell réutilisant les widgets).
const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  component: lazyRouteComponent(() => import("../../features/dashboard/ui/dashboard-page")),
});

// Notes de frais — migration clean-archi de `pages/NotesFrais.tsx` (débloquée par OPE-490 backend).
const notesFraisRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notes-frais",
  component: lazyRouteComponent(() => import("../../features/notes-frais/ui/notes-frais-page")),
});

const routeTree = rootRoute.addChildren([pingRoute, clientsRoute, clientDetailRoute, notificationsRoute, techniciensRoute, fournisseursRoute, articlesRoute, devisRoute, facturesRoute, interventionsRoute, commandesRoute, stocksRoute, depensesRoute, comptabiliteRoute, portailGestionRoute, budgetsDepensesRoute, reglesDepensesRoute, historiqueEmailsRoute, supportRoute, avisRoute, flotteRoute, statistiquesRoute, modulesRoute, congesRoute, contratsRoute, relancesDevisRoute, calendrierRoute, utilisateursRoute, devisOptionsRoute, parametresRoute, dashboardRoute, notesFraisRoute, chatRoute, badgesRoute, classementRoute, modelesEmailRoute, modelesTransactionnelsRoute, assistantConversationsRoute, vehiculesRoute, rapportCommandeRoute, rapportsRoute, documentationRoute, maVitrineRoute, rdvEnLigneRoute, alertesPrevisionsRoute, previsionsRoute, performancesFournisseursRoute, tableauBordDepensesRoute, importReleveRoute, syncComptableRoute, geolocalisationRoute, planificationRoute, nouvelleDepenseRoute, integrationsComptablesRoute, analysesPhotosRoute, importRoute, devisIaRoute, chantiersRoute, assistantRoute]);

export const modernRouter = createRouter({
  routeTree,
  basepath: "/v2",
  defaultPendingComponent: RouterPending,
  defaultErrorComponent: RouterError,
});

// Type-safety du routeur neuf (liens/navigation typés) sans polluer le legacy.
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof modernRouter;
  }
}

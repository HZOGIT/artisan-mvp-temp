import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import PageEnConstruction from "./pages/PageEnConstruction";
import Dashboard from "./pages/Dashboard";
import { Clients } from "./pages/Clients";
import { ClientsNouveauPage } from "./pages/ClientsNouveauPage";
import DevisNouveauPage from "./pages/DevisNouveauPage";
import ClientDetail from "./pages/ClientDetail";
import ImportClients from "./pages/ImportClients";
import Devis from "./pages/Devis";
import DevisDetail from "./pages/DevisDetail";
import Factures from "./pages/Factures";
import FactureDetail from "./pages/FactureDetail";
import Interventions from "./pages/Interventions";
import Articles from "./pages/Articles";
import Profil from "./pages/Profil";
import Parametres from "./pages/Parametres";
import Calendrier from "./pages/Calendrier";
import DashboardAdvanced from "./pages/DashboardAdvanced";
import Stocks from "./pages/Stocks";
import Fournisseurs from "./pages/Fournisseurs";
import RapportCommande from "./pages/RapportCommande";
import RelancesDevis from "./pages/RelancesDevis";
import SignatureDevis from "./pages/SignatureDevis";
import ModelesEmail from "./pages/ModelesEmail";
import ModelesEmailTransactionnels from "./pages/ModelesEmailTransactionnels";
import PerformancesFournisseurs from "./pages/PerformancesFournisseurs";
import PaiementSucces from "./pages/PaiementSucces";
import PaiementAnnule from "./pages/PaiementAnnule";
import PortailClient from "./pages/PortailClient";
import Contrats from "./pages/Contrats";
import ContratDetail from "./pages/ContratDetail";
import InterventionsMobile from "./pages/InterventionsMobile";
import Chat from "./pages/Chat";
import Techniciens from "./pages/Techniciens";
import Avis from "./pages/Avis";
import SoumettreAvis from "./pages/SoumettreAvis";
import Geolocalisation from "./pages/Geolocalisation";
import Comptabilite from "./pages/Comptabilite";
import DevisOptions from "./pages/DevisOptions";
import Planification from "./pages/Planification";
import Rapports from "./pages/Rapports";
import Conges from "./pages/Conges";
import Previsions from "./pages/Previsions";
import Vehicules from "./pages/Vehicules";
import Badges from "./pages/Badges";
import SignInPage from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import AlertesPrevisions from "./pages/AlertesPrevisions";
import Chantiers from "./pages/Chantiers";
import IntegrationsComptables from "./pages/IntegrationsComptables";
import DevisIA from "./pages/DevisIA";
import Assistant from "./pages/Assistant";
import Notifications from "./pages/Notifications";
import RdvEnLigne from "./pages/RdvEnLigne";
import Vitrine from "./pages/Vitrine";
import MaVitrine from "./pages/MaVitrine";
import Utilisateurs from "./pages/Utilisateurs";
import DevisLigneEdit from "./pages/DevisLigneEdit";
import CalendrierChantiers from "./pages/CalendrierChantiers";
import CommandesFournisseurs from "./pages/CommandesFournisseurs";
import CommandeFournisseurForm from "./pages/CommandeFournisseurForm";
import CommandeFournisseurDetail from "./pages/CommandeFournisseurDetail";
import TableauBordSyncComptable from "./pages/TableauBordSyncComptable";
import StatistiquesDevis from "./pages/StatistiquesDevis";
import PortailGestion from "./pages/PortailGestion";
import Documentation from "./pages/Documentation";
import ModulesPage from "./pages/Modules";
import Onboarding from "./pages/Onboarding";
import DashboardLayout from "./components/DashboardLayout";
import { trpc } from "./lib/trpc";

// Routes accessibles MEME quand l'onboarding n'est pas terminé.
// L'artisan peut toujours accéder à son profil/paramètres/MonAssistant
// même s'il n'a pas validé l'onboarding.
const ONBOARDING_BYPASS = new Set([
  "/onboarding",
  "/profil",
  "/parametres",
  "/assistant",
  "/notifications",
]);

function AuthenticatedRoutes() {
  const [location, setLocation] = useLocation();
  // getOnboardingStatus est une route publique-protected qui lit les
  // colonnes onboarding_completed/metier/plan via raw SQL. Si la migration
  // n'a pas tourne, retourne {onboardingCompleted: true} → pas de redirect.
  const { data: onboardingStatus, isLoading: onbLoading } =
    trpc.modules.getOnboardingStatus.useQuery();

  useEffect(() => {
    if (onbLoading) return;
    if (!onboardingStatus) return;
    if (!onboardingStatus.onboardingCompleted && !ONBOARDING_BYPASS.has(location)) {
      setLocation("/onboarding");
    }
  }, [onboardingStatus, onbLoading, location, setLocation]);

  // L'onboarding est plein écran : pas de DashboardLayout autour.
  if (location === "/onboarding") {
    return <Onboarding />;
  }

  return (
    <DashboardLayout>
      <Switch location={location}>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/clients" component={Clients} />
        <Route path="/clients/nouveau" component={ClientsNouveauPage} />
        <Route path="/clients/import" component={ImportClients} />
        <Route path="/clients/:id" component={ClientDetail} />
        <Route path="/devis" component={Devis} />
        <Route path="/devis/nouveau" component={DevisNouveauPage} />
        <Route path="/devis/:id" component={DevisDetail} />
        <Route path="/devis/:id/ligne/nouvelle" component={DevisLigneEdit} />
        <Route path="/factures" component={Factures} />
        <Route path="/factures/:id" component={FactureDetail} />
        <Route path="/interventions" component={Interventions} />
        <Route path="/articles" component={Articles} />
        <Route path="/calendrier" component={Calendrier} />
        <Route path="/statistiques" component={StatistiquesDevis} />
        <Route path="/stocks" component={Stocks} />
        <Route path="/fournisseurs" component={Fournisseurs} />
        <Route path="/profil" component={Profil} />
        <Route path="/parametres" component={Parametres} />
        <Route path="/contrats" component={Contrats} />
        <Route path="/contrats/:id" component={ContratDetail} />
        <Route path="/mobile" component={InterventionsMobile} />
        <Route path="/chat" component={Chat} />
        <Route path="/techniciens" component={Techniciens} />
        <Route path="/avis" component={Avis} />
        <Route path="/geolocalisation" component={Geolocalisation} />
        <Route path="/comptabilite" component={Comptabilite} />
        <Route path="/planification" component={Planification} />
        <Route path="/rapports" component={Rapports} />
        <Route path="/conges" component={Conges} />
        <Route path="/previsions" component={Previsions} />
        <Route path="/vehicules" component={Vehicules} />
        <Route path="/badges" component={Badges} />
        <Route path="/alertes-previsions" component={AlertesPrevisions} />
        <Route path="/chantiers" component={Chantiers} />
        <Route path="/integrations-comptables" component={IntegrationsComptables} />
        <Route path="/devis-ia" component={DevisIA} />
        <Route path="/calendrier-chantiers" component={CalendrierChantiers} />
        <Route path="/tableau-bord-sync-comptable" component={TableauBordSyncComptable} />
        <Route path="/relances" component={RelancesDevis} />
        <Route path="/modeles-email" component={ModelesEmail} />
        <Route path="/modeles-email-transactionnels" component={ModelesEmailTransactionnels} />
        <Route path="/commandes/nouvelle" component={CommandeFournisseurForm} />
        <Route path="/commandes/:id/modifier" component={CommandeFournisseurForm} />
        <Route path="/commandes/:id" component={CommandeFournisseurDetail} />
        <Route path="/commandes" component={CommandesFournisseurs} />
        <Route path="/rapport-commande" component={RapportCommande} />
        <Route path="/performances-fournisseurs" component={PerformancesFournisseurs} />
        <Route path="/portail-gestion" component={PortailGestion} />
        <Route path="/assistant" component={Assistant} />
        <Route path="/notifications" component={Notifications} />
        <Route path="/rdv-en-ligne" component={RdvEnLigne} />
        <Route path="/ma-vitrine" component={MaVitrine} />
        <Route path="/utilisateurs" component={Utilisateurs} />
        <Route path="/documentation" component={Documentation} />
        <Route path="/modules" component={ModulesPage} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function Router() {
  const [location] = useLocation();

  return (
    <Switch location={location}>
      <Route path="/" component={Home} />
      <Route path="/signin" component={SignInPage} />
      <Route path="/sign-in" component={SignInPage} />
      <Route path="/signup" component={SignUp} />
      <Route path="/mentions-legales" component={PageEnConstruction} />
      <Route path="/cgv" component={PageEnConstruction} />
      <Route path="/confidentialite" component={PageEnConstruction} />
      <Route path="/contact" component={PageEnConstruction} />
      <Route path="/aide" component={PageEnConstruction} />
      <Route path="/guide" component={PageEnConstruction} />
      <Route path="/signature/:token" component={SignatureDevis} />
      <Route path="/devis-public/:token" component={SignatureDevis} />
      <Route path="/paiement/succes" component={PaiementSucces} />
      <Route path="/paiement/annule" component={PaiementAnnule} />
      <Route path="/portail/:token" component={PortailClient} />
      <Route path="/avis/:token" component={SoumettreAvis} />
      <Route path="/vitrine/:slug" component={Vitrine} />
      {/*
        Toutes les routes authentifiées passent par UN SEUL catch-all
        AuthenticatedRoutes. Sa propre <Switch> interne dispatche vers le bon
        composant de page. Conséquence : naviguer entre /devis et /factures
        ne re-mount PLUS DashboardLayout, donc l'état (drawer ouvert,
        conversation MonAssistant…) persiste entre les navigations.

        L'ancienne version listait chaque route avec
        `component={() => <AuthenticatedRoutes />}` — l'arrow inline créait
        un nouveau composant à chaque render et provoquait un remount du
        layout à chaque clic dans le menu.

        Les URLs inconnues atteignent aussi ce catch-all et tombent sur le
        NotFound interne d'AuthenticatedRoutes (ou sur l'écran "Connexion
        requise" si l'utilisateur n'est pas connecté).
      */}
      <Route component={AuthenticatedRoutes} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

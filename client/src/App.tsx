import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
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
import DevisLigneEdit from "./pages/DevisLigneEdit";
import CalendrierChantiers from "./pages/CalendrierChantiers";
import TableauBordSyncComptable from "./pages/TableauBordSyncComptable";
import StatistiquesDevis from "./pages/StatistiquesDevis";
import DashboardLayout from "./components/DashboardLayout";

// BYPASS CLERK TEMPORARILY - Redirect all authenticated routes directly to dashboard
function AuthenticatedRoutes() {
  const [location] = useLocation();
  
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
        <Route path="/rapport-commande" component={RapportCommande} />
        <Route path="/performances-fournisseurs" component={PerformancesFournisseurs} />
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
      <Route path="/signature/:token" component={SignatureDevis} />
      <Route path="/paiement/succes" component={PaiementSucces} />
      <Route path="/paiement/annule" component={PaiementAnnule} />
      <Route path="/portail/:token" component={PortailClient} />
      <Route path="/avis/:token" component={SoumettreAvis} />
      {/* BYPASS CLERK - All routes go to authenticated routes */}
      <Route path="/dashboard" component={() => <AuthenticatedRoutes />} />
      <Route path="/clients/:rest*" component={() => <AuthenticatedRoutes />} />
      <Route path="/clients" component={() => <AuthenticatedRoutes />} />
      <Route path="/devis/:id/ligne/nouvelle" component={() => <AuthenticatedRoutes />} />
      <Route path="/devis/:rest*" component={() => <AuthenticatedRoutes />} />
      <Route path="/devis" component={() => <AuthenticatedRoutes />} />
      <Route path="/factures/:rest*" component={() => <AuthenticatedRoutes />} />
      <Route path="/factures" component={() => <AuthenticatedRoutes />} />
      <Route path="/interventions" component={() => <AuthenticatedRoutes />} />
      <Route path="/articles" component={() => <AuthenticatedRoutes />} />
      <Route path="/calendrier" component={() => <AuthenticatedRoutes />} />
      <Route path="/statistiques" component={() => <AuthenticatedRoutes />} />
      <Route path="/stocks" component={() => <AuthenticatedRoutes />} />
      <Route path="/fournisseurs" component={() => <AuthenticatedRoutes />} />
      <Route path="/profil" component={() => <AuthenticatedRoutes />} />
      <Route path="/parametres" component={() => <AuthenticatedRoutes />} />
      <Route path="/contrats" component={() => <AuthenticatedRoutes />} />
      <Route path="/mobile" component={() => <AuthenticatedRoutes />} />
      <Route path="/chat" component={() => <AuthenticatedRoutes />} />
      <Route path="/techniciens" component={() => <AuthenticatedRoutes />} />
      <Route path="/avis" component={() => <AuthenticatedRoutes />} />
      <Route path="/geolocalisation" component={() => <AuthenticatedRoutes />} />
      <Route path="/comptabilite" component={() => <AuthenticatedRoutes />} />
      <Route path="/planification" component={() => <AuthenticatedRoutes />} />
      <Route path="/rapports" component={() => <AuthenticatedRoutes />} />
      <Route path="/conges" component={() => <AuthenticatedRoutes />} />
      <Route path="/previsions" component={() => <AuthenticatedRoutes />} />
      <Route path="/vehicules" component={() => <AuthenticatedRoutes />} />
      <Route path="/badges" component={() => <AuthenticatedRoutes />} />
      <Route path="/alertes-previsions" component={() => <AuthenticatedRoutes />} />
      <Route path="/chantiers" component={() => <AuthenticatedRoutes />} />
      <Route path="/integrations-comptables" component={() => <AuthenticatedRoutes />} />
      <Route path="/devis-ia" component={() => <AuthenticatedRoutes />} />
      <Route path="/calendrier-chantiers" component={() => <AuthenticatedRoutes />} />
      <Route path="/tableau-bord-sync-comptable" component={() => <AuthenticatedRoutes />} />
      <Route path="/relances" component={() => <AuthenticatedRoutes />} />
      <Route path="/modeles-email" component={() => <AuthenticatedRoutes />} />
      <Route path="/modeles-email-transactionnels" component={() => <AuthenticatedRoutes />} />
      <Route path="/rapport-commande" component={() => <AuthenticatedRoutes />} />
      <Route path="/performances-fournisseurs" component={() => <AuthenticatedRoutes />} />
      <Route component={NotFound} />
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

import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { trpc } from "./lib/trpc";

// ============================================================================
// IMPORTS EAGER — pages critiques chargées dans le bundle initial
// (route racine + auth + dashboard immediatement disponible apres login)
// ============================================================================
import Home from "./pages/Home";
import SignInPage from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Onboarding from "./pages/Onboarding";
import NotFound from "./pages/NotFound";
import DashboardLayout from "./components/DashboardLayout";

// ============================================================================
// IMPORTS LAZY — pages chargees a la demande via React.lazy + Suspense.
// Chaque page devient un chunk webpack/Vite separe → bundle initial reduit.
// ============================================================================
const PageEnConstruction = lazy(() => import("./pages/PageEnConstruction"));
const Clients = lazy(() => import("./pages/Clients").then((m) => ({ default: m.Clients })));
const ClientsNouveauPage = lazy(() => import("./pages/ClientsNouveauPage").then((m) => ({ default: m.ClientsNouveauPage })));
const ClientDetail = lazy(() => import("./pages/ClientDetail"));
const ImportClients = lazy(() => import("./pages/ImportClients"));
const Devis = lazy(() => import("./pages/Devis"));
const DevisNouveauPage = lazy(() => import("./pages/DevisNouveauPage"));
const DevisDetail = lazy(() => import("./pages/DevisDetail"));
const DevisLigneEdit = lazy(() => import("./pages/DevisLigneEdit"));
const Factures = lazy(() => import("./pages/Factures"));
const FactureDetail = lazy(() => import("./pages/FactureDetail"));
const Interventions = lazy(() => import("./pages/Interventions"));
const Articles = lazy(() => import("./pages/Articles"));
const Profil = lazy(() => import("./pages/Profil"));
const Parametres = lazy(() => import("./pages/Parametres"));
const Calendrier = lazy(() => import("./pages/Calendrier"));
const Stocks = lazy(() => import("./pages/Stocks"));
const Fournisseurs = lazy(() => import("./pages/Fournisseurs"));
const RapportCommande = lazy(() => import("./pages/RapportCommande"));
const RelancesDevis = lazy(() => import("./pages/RelancesDevis"));
const SignatureDevis = lazy(() => import("./pages/SignatureDevis"));
const ModelesEmail = lazy(() => import("./pages/ModelesEmail"));
const ModelesEmailTransactionnels = lazy(() => import("./pages/ModelesEmailTransactionnels"));
const HistoriqueEmails = lazy(() => import("./pages/HistoriqueEmails"));
const PerformancesFournisseurs = lazy(() => import("./pages/PerformancesFournisseurs"));
const PaiementSucces = lazy(() => import("./pages/PaiementSucces"));
const PaiementAnnule = lazy(() => import("./pages/PaiementAnnule"));
const PortailClient = lazy(() => import("./pages/PortailClient"));
const Contrats = lazy(() => import("./pages/Contrats"));
const ContratDetail = lazy(() => import("./pages/ContratDetail"));
const InterventionsMobile = lazy(() => import("./pages/InterventionsMobile"));
const Chat = lazy(() => import("./pages/Chat"));
const Techniciens = lazy(() => import("./pages/Techniciens"));
const Avis = lazy(() => import("./pages/Avis"));
const SoumettreAvis = lazy(() => import("./pages/SoumettreAvis"));
const Geolocalisation = lazy(() => import("./pages/Geolocalisation"));
const Comptabilite = lazy(() => import("./pages/Comptabilite"));
const Planification = lazy(() => import("./pages/Planification"));
const Rapports = lazy(() => import("./pages/Rapports"));
const Conges = lazy(() => import("./pages/Conges"));
const Previsions = lazy(() => import("./pages/Previsions"));
const Vehicules = lazy(() => import("./pages/Vehicules"));
const Badges = lazy(() => import("./pages/Badges"));
const AlertesPrevisions = lazy(() => import("./pages/AlertesPrevisions"));
const Chantiers = lazy(() => import("./pages/Chantiers"));
const IntegrationsComptables = lazy(() => import("./pages/IntegrationsComptables"));
const DevisIA = lazy(() => import("./pages/DevisIA"));
const Assistant = lazy(() => import("./pages/Assistant"));
const AssistantConversations = lazy(() => import("./pages/AssistantConversations"));
const Notifications = lazy(() => import("./pages/Notifications"));
const RdvEnLigne = lazy(() => import("./pages/RdvEnLigne"));
const Vitrine = lazy(() => import("./pages/Vitrine"));
const MaVitrine = lazy(() => import("./pages/MaVitrine"));
const Utilisateurs = lazy(() => import("./pages/Utilisateurs"));
const CalendrierChantiers = lazy(() => import("./pages/CalendrierChantiers"));
const CommandesFournisseurs = lazy(() => import("./pages/CommandesFournisseurs"));
const CommandeFournisseurForm = lazy(() => import("./pages/CommandeFournisseurForm"));
const CommandeFournisseurDetail = lazy(() => import("./pages/CommandeFournisseurDetail"));
const TableauBordSyncComptable = lazy(() => import("./pages/TableauBordSyncComptable"));
const StatistiquesDevis = lazy(() => import("./pages/StatistiquesDevis"));
const PortailGestion = lazy(() => import("./pages/PortailGestion"));
const Documentation = lazy(() => import("./pages/Documentation"));
const ModulesPage = lazy(() => import("./pages/Modules"));
const ImportPage = lazy(() => import("./pages/Import"));
const Support = lazy(() => import("./pages/Support"));
const DevisOptions = lazy(() => import("./pages/DevisOptions"));
const Flotte = lazy(() => import("./pages/Flotte"));
const Classement = lazy(() => import("./pages/Classement"));
const AnalysesPhotos = lazy(() => import("./pages/AnalysesPhotos"));
const Depenses = lazy(() => import("./pages/Depenses"));
const NouvelleDepense = lazy(() => import("./pages/NouvelleDepense"));
const NotesFrais = lazy(() => import("./pages/NotesFrais"));
const TableauBordDepenses = lazy(() => import("./pages/TableauBordDepenses"));
const ImportReleveDepenses = lazy(() => import("./pages/ImportReleve"));
const BudgetsDepenses = lazy(() => import("./pages/BudgetsDepenses"));
const ReglesDepenses = lazy(() => import("./pages/ReglesDepenses"));
const MentionsLegales = lazy(() => import("./pages/legal/MentionsLegales"));
const CGU = lazy(() => import("./pages/legal/CGU"));
// PoC OPE-366 — page « stack cible » (clean archi + REST openapi-typescript), cohabite avec le legacy.
const ModernRouterMount = lazy(() => import("./modern/shared/router/ModernRouterMount"));
const CGV = lazy(() => import("./pages/legal/CGV"));
const Confidentialite = lazy(() => import("./pages/legal/Confidentialite"));

// Skeleton de chargement pour les pages lazy.
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64 w-full">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    </div>
  );
}

// Routes accessibles MEME quand l'onboarding n'est pas terminé.
const ONBOARDING_BYPASS = new Set([
  "/onboarding",
  "/profil",
  "/parametres",
  "/assistant",
  "/assistant/conversations",
  "/notifications",
]);

function AuthenticatedRoutes() {
  const [location, setLocation] = useLocation();
  const { data: onboardingStatus, isLoading: onbLoading } =
    trpc.modules.getOnboardingStatus.useQuery();

  useEffect(() => {
    if (onbLoading) return;
    if (!onboardingStatus) return;
    if (!onboardingStatus.onboardingCompleted && !ONBOARDING_BYPASS.has(location)) {
      setLocation("/onboarding");
    }
  }, [onboardingStatus, onbLoading, location, setLocation]);

  // L'onboarding est plein écran : pas de DashboardLayout autour, et il est
  // EAGER (pas dans Suspense) pour eviter le flash de skeleton sur le premier
  // ecran apres signup.
  if (location === "/onboarding") {
    return <Onboarding />;
  }

  return (
    <DashboardLayout>
      <Suspense fallback={<PageLoader />}>
        <Switch location={location}>
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/clients" component={Clients} />
          {/* Socle refonte (OPE-415) : TanStack Router monté sur TOUT `/v2/*` (cohabite avec wouter,
              providers + auth partagés). Reprend l'ancien PoC `/v2/clients` + démo `/v2/ping`. */}
          <Route path="/v2/:rest*" component={ModernRouterMount} />
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
          <Route path="/devis-options" component={DevisOptions} />
          <Route path="/flotte" component={Flotte} />
          <Route path="/classement" component={Classement} />
          <Route path="/analyses-photos" component={AnalysesPhotos} />
          <Route path="/depenses" component={Depenses} />
          <Route path="/depenses/nouvelle" component={NouvelleDepense} />
          <Route path="/notes-de-frais" component={NotesFrais} />
          <Route path="/tableau-bord-depenses" component={TableauBordDepenses} />
          <Route path="/import-releve" component={ImportReleveDepenses} />
          <Route path="/budgets-depenses" component={BudgetsDepenses} />
          <Route path="/regles-depenses" component={ReglesDepenses} />
          <Route path="/chantiers" component={Chantiers} />
          <Route path="/integrations-comptables" component={IntegrationsComptables} />
          <Route path="/devis-ia" component={DevisIA} />
          <Route path="/calendrier-chantiers" component={CalendrierChantiers} />
          <Route path="/tableau-bord-sync-comptable" component={TableauBordSyncComptable} />
          <Route path="/relances" component={RelancesDevis} />
          <Route path="/modeles-email" component={ModelesEmail} />
          <Route path="/modeles-email-transactionnels" component={ModelesEmailTransactionnels} />
          <Route path="/historique-emails" component={HistoriqueEmails} />
          <Route path="/commandes/nouvelle" component={CommandeFournisseurForm} />
          <Route path="/commandes/:id/modifier" component={CommandeFournisseurForm} />
          <Route path="/commandes/:id" component={CommandeFournisseurDetail} />
          <Route path="/commandes" component={CommandesFournisseurs} />
          <Route path="/rapport-commande" component={RapportCommande} />
          <Route path="/performances-fournisseurs" component={PerformancesFournisseurs} />
          <Route path="/portail-gestion" component={PortailGestion} />
          <Route path="/assistant/conversations" component={AssistantConversations} />
          <Route path="/assistant" component={Assistant} />
          <Route path="/notifications" component={Notifications} />
          <Route path="/rdv-en-ligne" component={RdvEnLigne} />
          <Route path="/ma-vitrine" component={MaVitrine} />
          <Route path="/utilisateurs" component={Utilisateurs} />
          <Route path="/documentation" component={Documentation} />
          <Route path="/modules" component={ModulesPage} />
          <Route path="/import" component={ImportPage} />
          <Route path="/support" component={Support} />
          {/* Pages legales — publiques, pas d'auth requise */}
          <Route path="/mentions-legales" component={MentionsLegales} />
          <Route path="/cgu" component={CGU} />
          <Route path="/cgv" component={CGV} />
          <Route path="/confidentialite" component={Confidentialite} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </DashboardLayout>
  );
}

function Router() {
  const [location] = useLocation();

  return (
    <Suspense fallback={<PageLoader />}>
      <Switch location={location}>
        <Route path="/" component={Home} />
        <Route path="/signin" component={SignInPage} />
        <Route path="/sign-in" component={SignInPage} />
        <Route path="/signup" component={SignUp} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
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
          AuthenticatedRoutes pour que DashboardLayout (et MonAssistant
          drawer) persiste entre les navigations.
        */}
        <Route component={AuthenticatedRoutes} />
      </Switch>
    </Suspense>
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

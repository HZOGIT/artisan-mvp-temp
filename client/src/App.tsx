import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";
import Devis from "./pages/Devis";
import DevisDetail from "./pages/DevisDetail";
import Factures from "./pages/Factures";
import FactureDetail from "./pages/FactureDetail";
import Interventions from "./pages/Interventions";
import Articles from "./pages/Articles";
import Profil from "./pages/Profil";
import Parametres from "./pages/Parametres";
import Calendrier from "./pages/Calendrier";
import DashboardLayout from "./components/DashboardLayout";
import { useAuth } from "./_core/hooks/useAuth";

function AuthenticatedRoutes() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/clients" component={Clients} />
        <Route path="/clients/:id" component={ClientDetail} />
        <Route path="/devis" component={Devis} />
        <Route path="/devis/:id" component={DevisDetail} />
        <Route path="/factures" component={Factures} />
        <Route path="/factures/:id" component={FactureDetail} />
        <Route path="/interventions" component={Interventions} />
        <Route path="/articles" component={Articles} />
        <Route path="/calendrier" component={Calendrier} />
        <Route path="/profil" component={Profil} />
        <Route path="/parametres" component={Parametres} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function Router() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/" component={Home} />
      {isAuthenticated && (
        <>
          <Route path="/dashboard" component={() => <AuthenticatedRoutes />} />
          <Route path="/clients/:rest*" component={() => <AuthenticatedRoutes />} />
          <Route path="/clients" component={() => <AuthenticatedRoutes />} />
          <Route path="/devis/:rest*" component={() => <AuthenticatedRoutes />} />
          <Route path="/devis" component={() => <AuthenticatedRoutes />} />
          <Route path="/factures/:rest*" component={() => <AuthenticatedRoutes />} />
          <Route path="/factures" component={() => <AuthenticatedRoutes />} />
          <Route path="/interventions" component={() => <AuthenticatedRoutes />} />
          <Route path="/articles" component={() => <AuthenticatedRoutes />} />
          <Route path="/calendrier" component={() => <AuthenticatedRoutes />} />
          <Route path="/profil" component={() => <AuthenticatedRoutes />} />
          <Route path="/parametres" component={() => <AuthenticatedRoutes />} />
        </>
      )}
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

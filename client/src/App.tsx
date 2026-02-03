import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import { Clients } from "./pages/Clients";
import { ClientsNouveauPage } from "./pages/ClientsNouveauPage";
import ClientDetail from "./pages/ClientDetail";
import Devis from "./pages/Devis";
import DevisLigneEdit from "./pages/DevisLigneEdit";
import Factures from "./pages/Factures";
import Interventions from "./pages/Interventions";
import PaiementSucces from "./pages/PaiementSucces";
import PaiementAnnule from "./pages/PaiementAnnule";
import SignIn from "./pages/SignIn";
import DashboardLayout from "./components/DashboardLayout";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import PlaceholderPage from "./pages/PlaceholderPage";

// MVP Routes Only
function AuthenticatedRoutes() {
  const [location] = useLocation();
  
  return (
    <DashboardLayout>
      <Switch location={location}>
        {/* MVP Routes - Fully Functional */}
        <Route path="/clients" component={Clients} />
        <Route path="/clients/nouveau" component={ClientsNouveauPage} />
        <Route path="/clients/:id" component={ClientDetail} />
        <Route path="/devis" component={Devis} />
        <Route path="/devis/:id/ligne/nouvelle" component={DevisLigneEdit} />
        <Route path="/factures" component={Factures} />
        <Route path="/interventions" component={Interventions} />
        <Route path="/articles" element={<PlaceholderPage title="Articles" />} />
        <Route path="/profil" element={<PlaceholderPage title="Mon profil" />} />
        
        {/* Placeholder Routes - Coming Soon */}
        <Route path="/dashboard" element={<PlaceholderPage title="Tableau de bord" />} />
        <Route path="/paiement/succes" component={PaiementSucces} />
        <Route path="/paiement/annule" component={PaiementAnnule} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <TooltipProvider>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/sign-in" component={SignIn} />
            <Route component={AuthenticatedRoutes} />
          </Switch>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

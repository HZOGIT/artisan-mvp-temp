import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import { Clients } from "./pages/Clients";
import { ClientsNouveauPage } from "./pages/ClientsNouveauPage";
import DevisNouveauPage from "./pages/DevisNouveauPage";
import ClientDetail from "./pages/ClientDetail";
import Devis from "./pages/Devis";
import DevisDetail from "./pages/DevisDetail";
import Factures from "./pages/Factures";
import FactureDetail from "./pages/FactureDetail";
import Interventions from "./pages/Interventions";
import PaiementSucces from "./pages/PaiementSucces";
import PaiementAnnule from "./pages/PaiementAnnule";
// Pages d'authentification supprimées - à implémenter
import DevisLigneEdit from "./pages/DevisLigneEdit";
import DashboardLayout from "./components/DashboardLayout";

// MVP Routes Only
function AuthenticatedRoutes() {
  const [location] = useLocation();
  
  return (
    <DashboardLayout>
      <Switch location={location}>
        <Route path="/clients" component={Clients} />
        <Route path="/clients/nouveau" component={ClientsNouveauPage} />
        <Route path="/clients/:id" component={ClientDetail} />
        <Route path="/devis" component={Devis} />
        <Route path="/devis/nouveau" component={DevisNouveauPage} />
        <Route path="/devis/:id" component={DevisDetail} />
        <Route path="/devis/:id/ligne/nouvelle" component={DevisLigneEdit} />
        <Route path="/factures" component={Factures} />
        <Route path="/factures/:id" component={FactureDetail} />
        <Route path="/interventions" component={Interventions} />
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
            <Route component={AuthenticatedRoutes} />
          </Switch>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

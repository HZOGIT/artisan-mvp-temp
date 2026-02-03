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
import DashboardLayout from "./components/DashboardLayout";
import { TooltipProvider } from "@radix-ui/react-tooltip";

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
        <Route path="/devis/:id/ligne/nouvelle" component={DevisLigneEdit} />
        <Route path="/factures" component={Factures} />
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

import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { trpc } from "./lib/trpc";
import { useV2Bascule } from "./modern/shared/flag/use-v2-bascule";

// ============================================================================
// IMPORTS EAGER — pages critiques chargées dans le bundle initial
// (route racine + auth + dashboard immediatement disponible apres login)
// ============================================================================
import Onboarding from "./pages/Onboarding";
import NotFound from "./pages/NotFound";
import DashboardLayout from "./components/DashboardLayout";

// ============================================================================
// IMPORTS LAZY — pages chargees a la demande via React.lazy + Suspense.
// Chaque page devient un chunk webpack/Vite separe → bundle initial reduit.
// ============================================================================
const Assistant = lazy(() => import("./pages/Assistant"));
// PoC OPE-366 — page « stack cible » (clean archi + REST openapi-typescript), cohabite avec le legacy.
const ModernRouterMount = lazy(() => import("./modern/shared/router/modern-router-mount"));
// Montage du front neuf pour les pages PUBLIQUES (hors auth) : paiement (et à venir signature/portail).
const PublicModernRouterMount = lazy(() => import("./modern/shared/router/public-router-mount"));

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
  // Bascule strangler-fig opt-in (OPE-420) : si `?v2=1` et route migrée → redirige vers `/v2/<route>`.
  // No-op par défaut (flag inactif) → legacy strictement inchangé.
  useV2Bascule();
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
          <Route path="/dashboard">{() => <Redirect to={`/v2/dashboard${window.location.search}`} />}</Route>
          {/* Socle refonte (OPE-415) : TanStack Router monté sur TOUT `/v2/*` (cohabite avec wouter,
              providers + auth partagés). Reprend l'ancien PoC `/v2/clients` + démo `/v2/ping`. */}
          <Route path="/v2/*" component={ModernRouterMount} />
          <Route path="/assistant" component={Assistant} />
          {/* Pages legales — publiques, pas d'auth requise */}
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
        <Route path="/">{() => <Redirect to={`/v2/home${window.location.search}`} />}</Route>
        <Route path="/signin">{() => <Redirect to={`/v2/signin${window.location.search}`} />}</Route>
        <Route path="/sign-in">{() => <Redirect to={`/v2/sign-in${window.location.search}`} />}</Route>
        <Route path="/signup">{() => <Redirect to={`/v2/signup${window.location.search}`} />}</Route>
        <Route path="/forgot-password">{() => <Redirect to={`/v2/forgot-password${window.location.search}`} />}</Route>
        <Route path="/reset-password">{() => <Redirect to={`/v2/reset-password${window.location.search}`} />}</Route>
        <Route path="/v2/contact" component={PublicModernRouterMount} />
        <Route path="/v2/aide" component={PublicModernRouterMount} />
        <Route path="/v2/guide" component={PublicModernRouterMount} />
        <Route path="/contact">{() => <Redirect to={`/v2/contact${window.location.search}`} />}</Route>
        <Route path="/aide">{() => <Redirect to={`/v2/aide${window.location.search}`} />}</Route>
        <Route path="/guide">{() => <Redirect to={`/v2/guide${window.location.search}`} />}</Route>
        {/* Cutover strangler-fig (OPE-403) : pages publiques par token entièrement migrées → redirection
            INCONDITIONNELLE vers le front neuf /v2 (query string préservée pour le retour Stripe). Les
            pages legacy SignatureDevis/PortailClient ont été SUPPRIMÉES (plus de fallback ?v2=0 ici). */}
        <Route path="/signature/:token">{(p) => <Redirect to={`/v2/signature/${p.token}${window.location.search}`} />}</Route>
        <Route path="/devis-public/:token">{(p) => <Redirect to={`/v2/devis-public/${p.token}${window.location.search}`} />}</Route>
        <Route path="/paiement/succes">{() => <Redirect to={`/v2/paiement/succes${window.location.search}`} />}</Route>
        <Route path="/paiement/annule">{() => <Redirect to={`/v2/paiement/annule${window.location.search}`} />}</Route>
        {/* Front neuf PUBLIC (hors auth) — pages paiement `/v2/*` montées avant le catch-all authentifié. */}
        <Route path="/v2/paiement/succes" component={PublicModernRouterMount} />
        <Route path="/v2/paiement/annule" component={PublicModernRouterMount} />
        <Route path="/v2/signature/:token" component={PublicModernRouterMount} />
        <Route path="/v2/devis-public/:token" component={PublicModernRouterMount} />
        <Route path="/v2/portail/:token" component={PublicModernRouterMount} />
        <Route path="/v2/home" component={PublicModernRouterMount} />
        <Route path="/v2/avis/:token" component={PublicModernRouterMount} />
        <Route path="/v2/vitrine/:slug" component={PublicModernRouterMount} />
        {/* Pages d'auth v2 montées en PUBLIC (visiteur déconnecté) — AVANT le catch-all authentifié. */}
        <Route path="/v2/signin" component={PublicModernRouterMount} />
        <Route path="/v2/sign-in" component={PublicModernRouterMount} />
        <Route path="/v2/signup" component={PublicModernRouterMount} />
        <Route path="/v2/forgot-password" component={PublicModernRouterMount} />
        <Route path="/v2/reset-password" component={PublicModernRouterMount} />
        {/* Pages légales v2 publiques + redirections (corrige le shadow PageEnConstruction des pages migrées). */}
        <Route path="/v2/mentions-legales" component={PublicModernRouterMount} />
        <Route path="/v2/cgu" component={PublicModernRouterMount} />
        <Route path="/v2/cgv" component={PublicModernRouterMount} />
        <Route path="/v2/confidentialite" component={PublicModernRouterMount} />
        <Route path="/mentions-legales">{() => <Redirect to={`/v2/mentions-legales${window.location.search}`} />}</Route>
        <Route path="/cgu">{() => <Redirect to={`/v2/cgu${window.location.search}`} />}</Route>
        <Route path="/cgv">{() => <Redirect to={`/v2/cgv${window.location.search}`} />}</Route>
        <Route path="/confidentialite">{() => <Redirect to={`/v2/confidentialite${window.location.search}`} />}</Route>
        <Route path="/portail/:token">{(p) => <Redirect to={`/v2/portail/${p.token}${window.location.search}`} />}</Route>
        <Route path="/avis/:token">{(p) => <Redirect to={`/v2/avis/${p.token}${window.location.search}`} />}</Route>
        <Route path="/vitrine/:slug">{(p) => <Redirect to={`/v2/vitrine/${p.slug}${window.location.search}`} />}</Route>
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

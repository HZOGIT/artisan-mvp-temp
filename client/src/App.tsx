import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useLocation, Redirect } from "./modern/shared/router/navigation";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { trpc } from "./modern/shared/trpc";
import { useV2Bascule } from "./modern/shared/flag/use-v2-bascule";
import { resolveEntryRoute } from "./modern/shared/router/entry-routes";

// ============================================================================
// IMPORTS EAGER — pages critiques chargées dans le bundle initial
// (route racine + auth + dashboard immediatement disponible apres login)
// ============================================================================
import Onboarding from "./modern/features/onboarding/ui/onboarding-page";
import NotFound from "./modern/features/not-found/ui/not-found-page";

// ============================================================================
// IMPORTS LAZY — pages chargees a la demande via React.lazy + Suspense.
// Chaque page devient un chunk webpack/Vite separe → bundle initial reduit.
// ============================================================================
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

  // Câblage final OPE-403 : `/v2/*` fournit désormais SA PROPRE chrome (shell modern via le root du routeur
  // TanStack → DashboardLayoutMount). On ne l'enveloppe donc PLUS dans le DashboardLayout legacy (sinon double
  // shell). Le legacy DashboardLayout n'est plus utilisé que… nulle part : seules restent les redirections et le 404.
  if (location.startsWith("/v2")) {
    return (
      <Suspense fallback={<PageLoader />}>
        <ModernRouterMount />
      </Suspense>
    );
  }

  const search = typeof window !== "undefined" ? window.location.search : "";
  if (location === "/dashboard") return <Redirect to={`/v2/dashboard${search}`} />;
  if (location === "/assistant") return <Redirect to={`/v2/assistant${search}`} />;
  return (
    <Suspense fallback={<PageLoader />}>
      <NotFound />
    </Suspense>
  );
}

// Routeur d'ENTRÉE (sans wouter) — dispatch impératif sur la location (shim History API). La classification
// (redirection legacy→/v2 / montage public /v2 / authentifié) est PURE et testée dans `resolveEntryRoute`.
function Router() {
  const [location] = useLocation();
  const search = typeof window !== "undefined" ? window.location.search : "";
  const route = resolveEntryRoute(location, search);

  if (route.kind === "redirect") return <Redirect to={route.to} />;
  return (
    <Suspense fallback={<PageLoader />}>
      {route.kind === "public" ? <PublicModernRouterMount /> : <AuthenticatedRoutes />}
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

import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useLocation, Redirect } from "./modern/shared/router/navigation";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { trpc } from "./modern/shared/trpc";
import { useV2Bascule } from "./modern/shared/flag/use-v2-bascule";

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

// Routeur d'ENTRÉE (sans wouter) — dispatch impératif sur la location (shim History API). Ordre = ancien Switch :
// (1) redirections legacy→/v2 exactes, (2) redirections à paramètre, (3) montages PUBLICS /v2 (hors auth),
// (4) catch-all authentifié. Query string préservée (retour Stripe).
const ENTRY_REDIRECTS: Record<string, string> = {
  "/": "/v2/home", "/signin": "/v2/signin", "/sign-in": "/v2/sign-in", "/signup": "/v2/signup",
  "/forgot-password": "/v2/forgot-password", "/reset-password": "/v2/reset-password",
  "/contact": "/v2/contact", "/aide": "/v2/aide", "/guide": "/v2/guide",
  "/paiement/succes": "/v2/paiement/succes", "/paiement/annule": "/v2/paiement/annule",
  "/mentions-legales": "/v2/mentions-legales", "/cgu": "/v2/cgu", "/cgv": "/v2/cgv", "/confidentialite": "/v2/confidentialite",
};
// /legacy/:param → /v2/legacy/:param (signature, devis-public, portail, avis, vitrine).
const PARAM_REDIRECTS: { re: RegExp; to: string }[] = [
  { re: /^\/(signature|devis-public|portail|avis)\/(.+)$/, to: "/v2/$1/$2" },
  { re: /^\/vitrine\/(.+)$/, to: "/v2/vitrine/$1" },
];
// Pages /v2 PUBLIQUES (hors auth) montées via PublicModernRouterMount.
const PUBLIC_V2_EXACT = new Set([
  "/v2/contact", "/v2/aide", "/v2/guide", "/v2/paiement/succes", "/v2/paiement/annule", "/v2/home",
  "/v2/signin", "/v2/sign-in", "/v2/signup", "/v2/forgot-password", "/v2/reset-password",
  "/v2/mentions-legales", "/v2/cgu", "/v2/cgv", "/v2/confidentialite",
]);
const PUBLIC_V2_PARAM_PREFIXES = ["/v2/signature/", "/v2/devis-public/", "/v2/portail/", "/v2/avis/", "/v2/vitrine/"];

function Router() {
  const [location] = useLocation();
  const search = typeof window !== "undefined" ? window.location.search : "";

  const exact = ENTRY_REDIRECTS[location];
  if (exact) return <Redirect to={`${exact}${search}`} />;
  for (const { re, to } of PARAM_REDIRECTS) {
    if (re.test(location)) return <Redirect to={`${location.replace(re, to)}${search}`} />;
  }
  if (PUBLIC_V2_EXACT.has(location) || PUBLIC_V2_PARAM_PREFIXES.some((p) => location.startsWith(p))) {
    return (
      <Suspense fallback={<PageLoader />}>
        <PublicModernRouterMount />
      </Suspense>
    );
  }
  // Tout le reste = authentifié (un seul catch-all pour que le shell modern persiste entre navigations).
  return (
    <Suspense fallback={<PageLoader />}>
      <AuthenticatedRoutes />
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

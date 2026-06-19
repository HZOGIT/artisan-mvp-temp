import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Toaster } from "@/shared/ui-kit/sonner";
import { TooltipProvider } from "@/shared/ui-kit/tooltip";
import ErrorBoundary from "./bootstrap/error-boundary";
import { ThemeProvider } from "./bootstrap/theme-context";

/*
 * Routeur UNIFIÉ (OPE-403/F1) : un seul RouterProvider TanStack porte TOUT l'espace d'URL — pages publiques
 * (hors shell), routes authentifiées (sous le shell modern via le layout `app-shell`), onboarding plein écran
 * et la redirection racine `/`→`/home`. Plus de dispatch manuel ni de double routeur (public/auth) dans App.
 */
const ModernRouterMount = lazy(() => import("./shared/router/modern-router-mount"));

/** Skeleton de chargement pour le montage lazy du routeur. */
function PageLoader() {
  const { t } = useTranslation("common");
  return (
    <div className="flex items-center justify-center h-64 w-full">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <TooltipProvider>
          <Suspense fallback={<PageLoader />}>
            <ModernRouterMount />
          </Suspense>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

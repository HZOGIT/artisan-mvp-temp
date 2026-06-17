import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

// Socle de routage PUBLIC du FRONT NEUF (pages hors authentification : paiement, signature, portail).
// Le routeur authentifié (cf. router.tsx) est monté dans `AuthenticatedRoutes` (sous DashboardLayout) ;
// celui-ci est monté dans le `Router` public de `App.tsx`, sur des chemins `/v2/...` PUBLICS explicites,
// HORS layout/auth. Même `basepath: /v2`. Deux arbres distincts → à une URL donnée, un seul s'active
// (wouter route exacte côté public vs catch-all authentifié).

function RouterPending() {
  return <div className="p-6 text-sm text-muted-foreground">…</div>;
}

function RouterError({ error }: ErrorComponentProps) {
  return (
    <div className="p-6 text-sm text-destructive">
      {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

function RouterNotFound() {
  const { t } = useTranslation("common");
  return <div className="p-6 text-sm text-muted-foreground">{t("routeNotFound")}</div>;
}

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: RouterNotFound,
});

const paiementSuccesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/paiement/succes",
  component: lazyRouteComponent(() => import("../../features/paiement/ui/paiement-succes-page")),
});

const paiementAnnuleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/paiement/annule",
  component: lazyRouteComponent(() => import("../../features/paiement/ui/paiement-annule-page")),
});

// Signature de devis (publique, par token) — port conforme de `pages/SignatureDevis.tsx`.
const signatureRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signature/$token",
  component: lazyRouteComponent(() => import("../../features/signature/ui/signature-devis-page")),
});
// Alias legacy `/devis-public/:token` → même page.
const devisPublicRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/devis-public/$token",
  component: lazyRouteComponent(() => import("../../features/signature/ui/signature-devis-page")),
});

const routeTree = rootRoute.addChildren([paiementSuccesRoute, paiementAnnuleRoute, signatureRoute, devisPublicRoute]);

export const publicModernRouter = createRouter({
  routeTree,
  basepath: "/v2",
  defaultPendingComponent: RouterPending,
  defaultErrorComponent: RouterError,
});

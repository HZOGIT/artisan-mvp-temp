import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

// Socle de routage du FRONT NEUF (refonte strangler-fig). TanStack Router prend la main sur tout le
// sous-arbre d'URL `/v2/*` (cf. `basepath`) tandis que wouter continue de servir le legacy intact.
// Le routeur est rendu DANS l'arbre React existant (cf. ModernRouterMount), donc il partage déjà les
// providers du legacy : QueryClient + tRPC (@trpc/react-query) + session/auth + DashboardLayout.
// Routage par CODE (pas de codegen file-based) pour rester explicite et sans plugin de build.

function RouterPending() {
  const { t } = useTranslation("common");
  return <div className="p-6 text-sm text-muted-foreground">{t("loading")}</div>;
}

function RouterError({ error }: ErrorComponentProps) {
  const { t } = useTranslation("common");
  return (
    <div className="p-6 text-sm text-destructive">
      {t("error")} {error instanceof Error ? error.message : String(error)}
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

// Route de démonstration du socle (OPE-415) — prouve montage + lazy + providers partagés.
const pingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ping",
  component: lazyRouteComponent(() => import("../../features/_demo/ping-page")),
});

// Liste Clients du front neuf — port conforme de `pages/Clients.tsx` (parité visuelle).
const clientsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/clients",
  component: lazyRouteComponent(() => import("../../features/clients/ui/clients-list-page")),
});

// Détail client — port conforme de `pages/ClientDetail.tsx` (param de route typé `$id`).
const clientDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/clients/$id",
  component: lazyRouteComponent(() => import("../../features/clients/ui/client-detail-page")),
});

// Notifications du front neuf — port conforme de `pages/Notifications.tsx`.
const notificationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notifications",
  component: lazyRouteComponent(() => import("../../features/notifications/ui/notifications-page")),
});

// Techniciens du front neuf — port conforme de `pages/Techniciens.tsx`.
const techniciensRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/techniciens",
  component: lazyRouteComponent(() => import("../../features/techniciens/ui/techniciens-page")),
});

// Fournisseurs du front neuf — port conforme de `pages/Fournisseurs.tsx`.
const fournisseursRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/fournisseurs",
  component: lazyRouteComponent(() => import("../../features/fournisseurs/ui/fournisseurs-page")),
});

const routeTree = rootRoute.addChildren([pingRoute, clientsRoute, clientDetailRoute, notificationsRoute, techniciensRoute, fournisseursRoute]);

export const modernRouter = createRouter({
  routeTree,
  basepath: "/v2",
  defaultPendingComponent: RouterPending,
  defaultErrorComponent: RouterError,
});

// Type-safety du routeur neuf (liens/navigation typés) sans polluer le legacy.
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof modernRouter;
  }
}

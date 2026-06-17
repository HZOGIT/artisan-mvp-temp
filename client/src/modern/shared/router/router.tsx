import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  type ErrorComponentProps,
} from "@tanstack/react-router";

// Socle de routage du FRONT NEUF (refonte strangler-fig). TanStack Router prend la main sur tout le
// sous-arbre d'URL `/v2/*` (cf. `basepath`) tandis que wouter continue de servir le legacy intact.
// Le routeur est rendu DANS l'arbre React existant (cf. ModernRouterMount), donc il partage déjà les
// providers du legacy : QueryClient + tRPC (@trpc/react-query) + session/auth + DashboardLayout.
// Routage par CODE (pas de codegen file-based) pour rester explicite et sans plugin de build.

function RouterPending() {
  return <div className="p-6 text-sm text-muted-foreground">Chargement…</div>;
}

function RouterError({ error }: ErrorComponentProps) {
  return (
    <div className="p-6 text-sm text-destructive">
      Une erreur est survenue. {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

function RouterNotFound() {
  return <div className="p-6 text-sm text-muted-foreground">Page introuvable (/v2).</div>;
}

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: RouterNotFound,
});

// Route de démonstration du socle (OPE-415) — prouve montage + lazy + providers partagés.
const pingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ping",
  component: lazyRouteComponent(() => import("../../features/_demo/PingPage")),
});

// Reprise de l'ancien PoC `/v2/clients` (auparavant câblé en route wouter isolée) sous le socle.
const clientsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/clients",
  component: lazyRouteComponent(() => import("../../features/clients/ui/ClientsModernPage")),
});

const routeTree = rootRoute.addChildren([pingRoute, clientsRoute]);

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

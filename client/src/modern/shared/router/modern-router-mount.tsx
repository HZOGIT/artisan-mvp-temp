import { RouterProvider } from "@tanstack/react-router";
import { modernRouter } from "./router";
// Initialise l'i18n du front neuf (react-i18next) AVANT le premier rendu du sous-arbre `/v2`.
import "../i18n";

// Point de montage du routeur neuf DANS l'arbre React legacy : il est rendu sous la route wouter
// `/v2/*` (cf. App.tsx), donc à l'intérieur des providers déjà en place (QueryClient + tRPC + auth +
// DashboardLayout). À partir de là, TanStack Router gère toute la navigation sous `/v2/*` (basepath).
// Le legacy (wouter + pages existantes) reste servi et intact pour tout le reste de l'app.
export default function ModernRouterMount() {
  return <RouterProvider router={modernRouter} />;
}

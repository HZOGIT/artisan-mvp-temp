import { RouterProvider } from "@tanstack/react-router";
import { publicModernRouter } from "./public-router";
// Initialise l'i18n du front neuf (idempotent) AVANT le premier rendu d'une page publique `/v2`.
import "../i18n";

// Point de montage du routeur neuf PUBLIC (hors auth) : rendu dans le `Router` public de `App.tsx`
// (pas de DashboardLayout). Partage les providers globaux montés dans `main.tsx` (QueryClient + tRPC).
export default function PublicModernRouterMount() {
  return <RouterProvider router={publicModernRouter} />;
}

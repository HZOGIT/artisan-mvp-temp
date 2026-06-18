import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { Outlet } from "@tanstack/react-router";
import { resolveV2Path } from "@/modern/shared/flag/v2-routes";
import { useShell } from "../application/use-shell";
import { DashboardLayout } from "./dashboard-layout";

// MOUNT du SHELL modern : branche les données (`useShell`) + la navigation (wouter `useLocation`/`setLocation`,
// même mécanisme que le legacy et que les pages /v2 — cf. commandes-page) + `resolveV2Path`, et enveloppe le
// `<Outlet/>` TanStack dans `DashboardLayout`. Destiné à devenir le composant RACINE du routeur modern (câblage
// final) pour remplacer le shell legacy `components/DashboardLayout`. Les zones branchées tRPC (recherche/notifs,
// bannières essai/expiré, FAB+drawer assistant) sont passées en SLOTS — fournies par le câblage pour préserver la
// parité (à porter avant le cutover, sinon régression de ces fonctionnalités).

export interface DashboardLayoutMountProps {
  topBarActions?: ReactNode;
  banners?: ReactNode;
  assistant?: ReactNode;
  assistantOpen?: boolean;
  mainExtraClass?: string;
  railBadge?: React.ComponentProps<typeof DashboardLayout>["railBadge"];
  itemBadge?: React.ComponentProps<typeof DashboardLayout>["itemBadge"];
}

export function DashboardLayoutMount(props: DashboardLayoutMountProps) {
  const [location, setLocation] = useLocation();
  const { user, permissions, modulesActifs, logout } = useShell();

  return (
    <DashboardLayout
      location={location}
      permissions={permissions}
      modulesActifs={modulesActifs}
      user={user}
      resolveV2Path={resolveV2Path}
      onNavigate={setLocation}
      onLogout={logout}
      topBarActions={props.topBarActions}
      banners={props.banners}
      assistant={props.assistant}
      assistantOpen={props.assistantOpen}
      mainExtraClass={props.mainExtraClass}
      railBadge={props.railBadge}
      itemBadge={props.itemBadge}
    >
      <Outlet />
    </DashboardLayout>
  );
}

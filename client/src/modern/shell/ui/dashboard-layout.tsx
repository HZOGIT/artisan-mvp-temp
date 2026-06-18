import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PanelLeft } from "lucide-react";
import type { GroupId, NavGroup } from "../domain/nav";
import { buildSidebarGroups, isPathActive, resolveActiveGroup, resolveActiveItem } from "../domain/nav";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";

// CONTAINER du SHELL modern : assemble Sidebar (rail+panneau) + MobileNav + top bar, gère l'état de navigation
// (groupe ouvert, drawer mobile, groupes dépliés). DÉCOUPLÉ : les données (permissions, modules actifs, user,
// resolveV2Path, navigation) et les zones branchées tRPC/auth (recherche/notifs, bannières, assistant) sont
// INJECTÉES par props/slots → 0 dépendance legacy. Le « mount » qui branche les données viendra plus tard.

export interface DashboardLayoutProps {
  location: string;
  permissions: string[];
  modulesActifs: string[] | null;
  user: { name?: string; email?: string; initial: string };
  logo?: string | null;
  entrepriseName?: string;
  resolveV2Path: (p: string) => string | null;
  onNavigate: (finalPath: string) => void;
  onLogout: () => void;
  assistantOpen?: boolean;
  mainExtraClass?: string;
  topBarActions?: ReactNode;
  banners?: ReactNode;
  assistant?: ReactNode;
  railBadge?: (groupId: GroupId) => ReactNode;
  itemBadge?: (path: string) => ReactNode;
  children: ReactNode;
}

export function DashboardLayout(props: DashboardLayoutProps) {
  const { t } = useTranslation("shell");
  const { location, permissions, modulesActifs, user, logo, entrepriseName, resolveV2Path, onNavigate, onLogout, assistantOpen, mainExtraClass, topBarActions, banners, assistant, railBadge, itemBadge, children } = props;

  const [openGroupId, setOpenGroupId] = useState<GroupId | null>(null);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [openMobileGroups, setOpenMobileGroups] = useState<Set<GroupId>>(new Set());

  const groups = useMemo(() => buildSidebarGroups(permissions, modulesActifs), [permissions, modulesActifs]);
  const isActive = (p: string) => isPathActive(location, p, resolveV2Path);
  const activeGroup = resolveActiveGroup(groups, location, resolveV2Path);
  const activeItem = resolveActiveItem(groups, location, resolveV2Path);

  // À l'ouverture du drawer mobile, déplier le groupe actif (port DashboardLayout).
  useEffect(() => {
    if (mobileMoreOpen) setOpenMobileGroups(new Set(activeGroup ? [activeGroup.id] : []));
  }, [mobileMoreOpen, activeGroup]);

  const navigate = (path: string) => {
    onNavigate(resolveV2Path(path) ?? path);
    setOpenGroupId(null);
    setMobileMoreOpen(false);
  };
  const railGroupClick = (group: NavGroup) => {
    if (group.items.length === 1) { navigate(group.items[0].path); return; }
    setOpenGroupId((prev) => (prev === group.id ? null : group.id));
  };
  const toggleMobileGroup = (gid: GroupId) =>
    setOpenMobileGroups((prev) => { const next = new Set(prev); if (next.has(gid)) next.delete(gid); else next.add(gid); return next; });

  return (
    <div className="relative min-h-screen flex bg-background text-foreground">
      <Sidebar
        groups={groups} openGroupId={openGroupId} activeGroupId={activeGroup?.id} assistantOpen={assistantOpen}
        logo={logo} userInitial={user.initial} userName={user.name} userEmail={user.email} isActivePath={isActive}
        onLogoClick={() => navigate("/dashboard")} onRailGroupClick={railGroupClick} onClosePanel={() => setOpenGroupId(null)}
        onNavigate={navigate} onProfil={() => navigate("/profil")} onParametres={() => navigate("/parametres")}
        onLogout={onLogout} railBadge={railBadge} itemBadge={itemBadge}
      />

      <div className={`flex-1 min-w-0 flex flex-col md:ml-16 transition-[margin] duration-300 ease-out ${assistantOpen ? (mainExtraClass ?? "") : ""}`}>
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 h-14 px-3 md:px-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:backdrop-blur border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <button className="md:hidden h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-accent" onClick={() => setMobileMoreOpen(true)} aria-label={t("ouvrirMenu")}>
              <PanelLeft className="h-4 w-4" />
            </button>
            <span className="font-medium tracking-tight truncate text-sm md:text-base">{activeItem?.label || activeGroup?.title || t("brand")}</span>
          </div>
          <div className="flex items-center gap-2">{topBarActions}</div>
        </header>

        <main className="flex-1 min-w-0">
          {banners}
          {children}
        </main>
      </div>

      <MobileNav
        groups={groups} activeGroupId={activeGroup?.id} moreOpen={mobileMoreOpen} openGroups={openMobileGroups}
        entrepriseName={entrepriseName} userEmail={user.email} isActivePath={isActive} onNavigate={navigate}
        onOpenMore={() => setMobileMoreOpen(true)} onCloseMore={() => setMobileMoreOpen(false)}
        onToggleGroup={toggleMobileGroup} onLogout={onLogout} itemBadge={itemBadge}
      />

      {assistant}
    </div>
  );
}

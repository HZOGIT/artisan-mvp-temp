import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X, ChevronRight, User, Settings, LogOut } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/modern/shared/ui/tooltip";
import { ScrollArea } from "@/modern/shared/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/modern/shared/ui/avatar";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/modern/shared/ui/dropdown-menu";
import type { NavGroup, GroupId } from "../domain/nav";
import { RAIL_COLORS } from "../domain/rail-colors";

// UI SHELL modern — sidebar (rail desktop + panneau étendu). PORT FIDÈLE de DashboardLayout, mais PILOTÉ PAR PROPS
// (aucune dépendance legacy/tRPC) → présentation pure (toute la logique est dans le domain testé `shell/domain/nav`).
// Les badges contextuels (ex. RDV en attente) sont injectés via `railBadge`/`itemBadge` ; l'état (groupe ouvert/actif)
// et la navigation sont fournis par le parent. Validé visuellement au câblage final (étape ultérieure).

export interface SidebarProps {
  groups: NavGroup[];
  openGroupId: GroupId | null;
  activeGroupId?: GroupId;
  assistantOpen?: boolean;
  logo?: string | null;
  userInitial: string;
  userName?: string;
  userEmail?: string;
  isActivePath: (path: string) => boolean;
  onLogoClick: () => void;
  onRailGroupClick: (group: NavGroup) => void;
  onClosePanel: () => void;
  onNavigate: (path: string) => void;
  onProfil: () => void;
  onParametres: () => void;
  onLogout: () => void;
  railBadge?: (groupId: GroupId) => ReactNode;
  itemBadge?: (path: string) => ReactNode;
}

export function Sidebar(props: SidebarProps) {
  const { t } = useTranslation("shell");
  const { groups, openGroupId, activeGroupId, assistantOpen, logo, userInitial, userName, userEmail, isActivePath, onLogoClick, onRailGroupClick, onClosePanel, onNavigate, onProfil, onParametres, onLogout, railBadge, itemBadge } = props;
  const openGroup = groups.find((g) => g.id === openGroupId) ?? null;

  return (
    <>
      {/* ─── RAIL DESKTOP ─── */}
      <nav aria-label={t("navPrincipale")} className="hidden md:flex fixed inset-y-0 left-0 z-40 w-16 flex-col items-center justify-between border-r border-border bg-card/80 backdrop-blur-sm py-3">
        <div className="flex flex-col items-center gap-1.5 w-full">
          <button onClick={onLogoClick} aria-label={t("accueilOperioz")} className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white inline-flex items-center justify-center shadow-md hover:shadow-lg transition-shadow mb-2">
            {logo ? <img src={logo} alt="" className="h-7 w-7 rounded object-contain" /> : <Sparkles className="h-5 w-5" />}
          </button>
          {groups.map((group) => {
            const styles = RAIL_COLORS[group.color] ?? RAIL_COLORS.blue;
            const isActive = activeGroupId === group.id;
            const isOpen = openGroupId === group.id;
            const Icon = group.icon;
            return (
              <Tooltip key={group.id} delayDuration={0}>
                <TooltipTrigger asChild>
                  <button onClick={() => onRailGroupClick(group)} aria-label={group.title} aria-pressed={isActive}
                    className={`h-10 w-10 inline-flex items-center justify-center rounded-xl text-muted-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isActive || isOpen ? `${styles.bgActive} ${styles.iconActive}` : styles.hover} ${group.id === "assistant" && assistantOpen ? "ring-2 ring-violet-500/30" : ""}`}>
                    <Icon className="h-5 w-5" />
                    {railBadge?.(group.id)}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{group.title}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-10 w-10 rounded-full bg-secondary/60 hover:bg-secondary text-secondary-foreground inline-flex items-center justify-center font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("monCompte")}>
              <Avatar className="h-9 w-9"><AvatarFallback className="text-xs font-semibold">{userInitial}</AvatarFallback></Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium truncate">{userName || "—"}</span>
                <span className="text-xs text-muted-foreground truncate">{userEmail || ""}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onProfil}><User className="h-4 w-4 mr-2" /> {t("monProfil")}</DropdownMenuItem>
            <DropdownMenuItem onClick={onParametres}><Settings className="h-4 w-4 mr-2" /> {t("parametres")}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout} className="cursor-pointer text-destructive focus:text-destructive"><LogOut className="h-4 w-4 mr-2" /> {t("deconnexion")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>

      {/* ─── PANNEAU ÉTENDU (overlay desktop) ─── */}
      <AnimatePresence>
        {openGroup && (
          <>
            <motion.div key="nav-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="hidden md:block fixed inset-0 left-16 z-30 bg-background/40 backdrop-blur-[3px]" onClick={onClosePanel} aria-hidden />
            <motion.aside key="nav-panel" initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} transition={{ type: "spring", stiffness: 280, damping: 28 }} className="hidden md:flex fixed inset-y-0 left-16 z-30 w-60 flex-col border-r border-border bg-card shadow-xl">
              {(() => {
                const styles = RAIL_COLORS[openGroup.color] ?? RAIL_COLORS.blue;
                const GroupIcon = openGroup.icon;
                return (
                  <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
                    <div className={`h-9 w-9 rounded-lg ${styles.bgActive} inline-flex items-center justify-center`}><GroupIcon className={`h-4 w-4 ${styles.iconActive}`} /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{openGroup.title}</p>
                      <p className="text-[11px] text-muted-foreground">{openGroup.items.length} {openGroup.items.length > 1 ? t("options") : t("option")}</p>
                    </div>
                    <button onClick={onClosePanel} aria-label={t("fermerPanneau")} className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"><X className="h-3.5 w-3.5" /></button>
                  </div>
                );
              })()}
              <ScrollArea className="flex-1">
                <ul className="p-2 space-y-0.5">
                  {openGroup.items.map((item) => {
                    const styles = RAIL_COLORS[openGroup.color] ?? RAIL_COLORS.blue;
                    const ItemIcon = item.icon;
                    const itemActive = isActivePath(item.path);
                    return (
                      <li key={item.path}>
                        <button onClick={() => onNavigate(item.path)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left ${itemActive ? `${styles.bgActive} ${styles.iconActive} font-medium` : "text-foreground hover:bg-accent"}`}>
                          <ItemIcon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                          {itemBadge?.(item.path)}
                          {itemActive && <ChevronRight className="h-3.5 w-3.5 ml-auto opacity-60" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

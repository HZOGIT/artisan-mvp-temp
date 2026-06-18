import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X, ChevronRight, LogOut, MoreHorizontal } from "lucide-react";
import { Button } from "@/modern/shared/ui/button";
import type { NavGroup, GroupId } from "../domain/nav";
import { MOBILE_PRIMARY } from "../domain/nav";
import { RAIL_COLORS } from "../domain/rail-colors";

// UI SHELL modern — navigation MOBILE (barre du bas + drawer « Plus » à groupes repliables). PORT FIDÈLE de
// DashboardLayout, PILOTÉ PAR PROPS (0 dépendance legacy/tRPC). État (ouvert, groupes dépliés) + nav fournis par
// le parent ; badges contextuels injectés via `itemBadge`. Validé visuellement au câblage final.

export interface MobileNavProps {
  groups: NavGroup[];
  activeGroupId?: GroupId;
  moreOpen: boolean;
  openGroups: Set<GroupId>;
  entrepriseName?: string;
  userEmail?: string;
  isActivePath: (path: string) => boolean;
  onNavigate: (path: string) => void;
  onOpenMore: () => void;
  onCloseMore: () => void;
  onToggleGroup: (id: GroupId) => void;
  onLogout: () => void;
  itemBadge?: (path: string) => ReactNode;
}

export function MobileNav(props: MobileNavProps) {
  const { t } = useTranslation("shell");
  const { groups, activeGroupId, moreOpen, openGroups, entrepriseName, userEmail, isActivePath, onNavigate, onOpenMore, onCloseMore, onToggleGroup, onLogout, itemBadge } = props;

  return (
    <>
      {/* ─── BARRE DU BAS ─── */}
      <nav aria-label={t("navMobile")} className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-card/95 backdrop-blur-sm">
        <div className="grid grid-cols-5">
          {MOBILE_PRIMARY.map((p) => {
            if (!groups.find((g) => g.id === p.id)) return null;
            const isActive = isActivePath(p.path) || activeGroupId === p.id;
            const Icon = p.icon;
            return (
              <button key={p.id} onClick={() => onNavigate(p.path)} className={`flex flex-col items-center justify-center gap-1 py-2.5 transition-colors ${isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{t(`mobile_${p.id}`)}</span>
              </button>
            );
          })}
          <button onClick={onOpenMore} className="flex flex-col items-center justify-center gap-1 py-2.5 text-muted-foreground hover:text-foreground">
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[10px] font-medium">{t("plus")}</span>
          </button>
        </div>
      </nav>

      {/* ─── DRAWER « PLUS » ─── */}
      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" onClick={onCloseMore} aria-hidden />
            <motion.aside initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", stiffness: 260, damping: 28 }} className="md:hidden fixed inset-y-0 left-0 z-50 w-[85%] max-w-sm bg-background shadow-2xl flex flex-col" role="dialog" aria-label={t("menuPrincipal")}>
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 inline-flex items-center justify-center text-white"><Sparkles className="h-5 w-5" /></div>
                  <div>
                    <p className="text-sm font-semibold leading-tight">{entrepriseName || t("brand")}</p>
                    <p className="text-[11px] text-muted-foreground">{userEmail}</p>
                  </div>
                </div>
                <button onClick={onCloseMore} className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-accent" aria-label={t("fermer")}><X className="h-4 w-4" /></button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                <div className="p-2 space-y-1">
                  {groups.map((group) => {
                    const styles = RAIL_COLORS[group.color] ?? RAIL_COLORS.blue;
                    const GroupIcon = group.icon;
                    const isOpen = openGroups.has(group.id);
                    return (
                      <div key={group.id} className="rounded-lg overflow-hidden">
                        <button type="button" onClick={() => onToggleGroup(group.id)} aria-expanded={isOpen} className={`w-full flex items-center gap-2 px-2 py-2.5 rounded-lg transition-colors ${isOpen ? "bg-accent/50" : "hover:bg-accent/30"}`}>
                          <div className={`h-7 w-7 shrink-0 rounded-lg ${styles.bgActive} inline-flex items-center justify-center`}><GroupIcon className={`h-3.5 w-3.5 ${styles.iconActive}`} /></div>
                          <span className="flex-1 text-left text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">{group.title}</span>
                          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} />
                        </button>
                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <motion.ul key="items" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: "easeOut" }} className="overflow-hidden">
                              <li className="pt-1 pb-1.5 space-y-0.5">
                                {group.items.map((item) => {
                                  const ItemIcon = item.icon;
                                  const itemActive = isActivePath(item.path);
                                  return (
                                    <button key={item.path} type="button" onClick={() => onNavigate(item.path)} className={`w-full flex items-center gap-3 pl-9 pr-3 py-2 rounded-lg text-sm transition-colors text-left ${itemActive ? `${styles.bgActive} ${styles.iconActive} font-medium` : "text-foreground hover:bg-accent"}`}>
                                      <ItemIcon className="h-4 w-4 shrink-0" />
                                      <span className="truncate">{item.label}</span>
                                      {itemBadge?.(item.path)}
                                    </button>
                                  );
                                })}
                              </li>
                            </motion.ul>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="p-3 border-t border-border shrink-0" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
                <Button variant="ghost" className="w-full justify-start text-destructive hover:text-destructive" onClick={onLogout}>
                  <LogOut className="h-4 w-4 mr-2" /> {t("deconnexion")}
                </Button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

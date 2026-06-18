import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "@/modern/shared/router/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X, Maximize2 } from "lucide-react";
import AssistantPage from "@/modern/features/assistant/ui/assistant-page";
import { PANEL_WIDTH_CLASS, PANEL_SIZE_OPTIONS, type AssistantPanelSize } from "../domain/assistant-panel";

// Drawer latéral MonAssistant du SHELL modern. Réutilise la page assistant modern en mode `embedded` (qui porte
// déjà tout le chat + streaming). Présentation pure : taille (sm/md/lg) + ouverture/fermeture INJECTÉES par props
// (état + persistance dans le mount). Desktop = colonne non-modale (pas d'overlay) ; mobile = plein écran + overlay.
interface AssistantDrawerProps {
  open: boolean;
  onClose: () => void;
  panelSize: AssistantPanelSize;
  onPanelSizeChange: (size: AssistantPanelSize) => void;
}

export function AssistantDrawer({ open, onClose, panelSize, onPanelSizeChange }: AssistantDrawerProps) {
  const { t } = useTranslation("shell");
  const [, setLocation] = useLocation();

  // ESC ferme le panneau (port du comportement legacy).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] md:hidden" onClick={onClose} aria-hidden />
          <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 280, damping: 30 }} role="dialog" aria-label={t("assistantTitle")} className={`fixed inset-y-0 right-0 z-40 w-full ${PANEL_WIDTH_CLASS[panelSize]} max-w-full bg-background border-l border-border shadow-2xl flex flex-col`}>
            <div className="flex items-center justify-between gap-2 px-4 h-14 border-b border-border shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 inline-flex items-center justify-center text-white shrink-0"><Sparkles className="h-4 w-4" /></div>
                <span className="font-semibold text-sm truncate">{t("assistantTitle")}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {/* Sélecteur de taille du panneau (desktop) — Compact / Normal / Large. */}
                <div className="hidden md:flex items-center gap-0.5 mr-1 rounded-md border border-border bg-muted/40 p-0.5">
                  {PANEL_SIZE_OPTIONS.map(({ size, labelKey, icon: Icon, iconClass }) => {
                    const isActive = panelSize === size;
                    return (
                      <button key={size} type="button" onClick={() => onPanelSizeChange(size)} aria-pressed={isActive} aria-label={t("taillePanneau", { label: t(labelKey) })} title={t(labelKey)} className={`h-7 w-7 inline-flex items-center justify-center rounded transition-colors ${isActive ? "bg-blue-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-background"}`}>
                        <Icon className={iconClass} />
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => { onClose(); setLocation("/assistant"); }} className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent" aria-label={t("ouvrirPleinePage")}><Maximize2 className="h-4 w-4" /></button>
                <button onClick={onClose} className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent" aria-label={t("fermerAssistant")}><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <AssistantPage embedded />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

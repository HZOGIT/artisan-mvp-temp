import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X, Maximize2 } from "lucide-react";
import AssistantPage from "@/modern/features/assistant/ui/assistant-page";

// Drawer latéral MonAssistant du SHELL modern. Réutilise la page assistant modern en mode `embedded` (qui porte
// déjà tout le chat + streaming) → bien plus simple que le legacy (340 l). Ouvre/ferme via props ; « pleine page »
// → /v2/assistant. PORT du comportement d'AssistantDrawer (panneau droit slide-in).
export function AssistantDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation("shell");
  const [, setLocation] = useLocation();
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] md:hidden" onClick={onClose} aria-hidden />
          <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 280, damping: 30 }} role="dialog" aria-label={t("assistantTitle")} className="fixed inset-y-0 right-0 z-40 w-full sm:w-[520px] max-w-full bg-background border-l border-border shadow-2xl flex flex-col">
            <div className="flex items-center justify-between gap-2 px-4 h-14 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 inline-flex items-center justify-center text-white"><Sparkles className="h-4 w-4" /></div>
                <span className="font-semibold text-sm">{t("assistantTitle")}</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => { onClose(); setLocation("/v2/assistant"); }} className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent" aria-label={t("ouvrirPleinePage")}><Maximize2 className="h-4 w-4" /></button>
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

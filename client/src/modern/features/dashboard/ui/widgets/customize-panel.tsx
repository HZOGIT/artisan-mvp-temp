import { Switch } from "@/modern/shared/ui/switch";
import { Button } from "@/modern/shared/ui/button";
import { AnimatePresence, motion } from "framer-motion";
import { RotateCcw, X } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

export interface CustomizableWidget {
  id: string;
  label: string;
  description?: string;
}

interface CustomizePanelProps {
  isOpen: boolean;
  onClose: () => void;
  widgets: CustomizableWidget[];
  hiddenIds: Set<string>;
  onToggle: (id: string, visible: boolean) => void;
  onReset: () => void;
}

/**
 * Panneau latéral droit pour personnaliser le dashboard :
 * - Liste des widgets disponibles avec toggle ON/OFF.
 * - Bouton "Réinitialiser" qui restaure l'ordre + visibilité par défaut.
 * - Overlay cliquable + ESC pour fermer.
 */
export function CustomizePanel({
  isOpen,
  onClose,
  widgets,
  hiddenIds,
  onToggle,
  onReset,
}: CustomizePanelProps) {
  const { t } = useTranslation("dashboard");
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 240, damping: 28 }}
            role="dialog"
            aria-label={t("personnaliserDashboard")}
            className="fixed inset-y-0 right-0 z-50 w-full sm:w-[380px] bg-background shadow-2xl border-l flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b shrink-0">
              <div>
                <h2 className="text-base font-semibold">{t("personnaliserDashboard")}</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {t("personnaliserDesc")}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("fermer")}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {widgets.map((w) => {
                const visible = !hiddenIds.has(w.id);
                return (
                  <label
                    key={w.id}
                    className="flex items-start gap-3 rounded-lg border border-border p-3 hover:bg-accent/30 cursor-pointer transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{w.label}</p>
                      {w.description && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">{w.description}</p>
                      )}
                    </div>
                    <Switch
                      checked={visible}
                      onCheckedChange={(checked) => onToggle(w.id, checked)}
                      aria-label={t("afficherWidget", { label: w.label })}
                    />
                  </label>
                );
              })}
            </div>

            <div className="p-4 border-t shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={onReset}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-2" />
                {t("reinitialiser")}
              </Button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

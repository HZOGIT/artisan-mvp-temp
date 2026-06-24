import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, AlertTriangle, ArrowRight, Info, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export interface DashboardAlert {
  type: "danger" | "warning" | "info";
  titre: string;
  message?: string;
  lien?: string;
}

interface AlertsBarProps {
  alerts: DashboardAlert[];
  onNavigate?: (path: string) => void;
}

const ALERT_STYLES = {
  danger: {
    icon: AlertCircle,
    bg: "bg-rose-50 dark:bg-rose-950/40",
    border: "border-rose-200 dark:border-rose-900",
    iconColor: "text-rose-600 dark:text-rose-400",
    text: "text-rose-900 dark:text-rose-200",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-orange-50 dark:bg-orange-950/40",
    border: "border-orange-200 dark:border-orange-900",
    iconColor: "text-orange-600 dark:text-orange-400",
    text: "text-orange-900 dark:text-orange-200",
  },
  info: {
    icon: Info,
    bg: "bg-blue-50 dark:bg-blue-950/40",
    border: "border-blue-200 dark:border-blue-900",
    iconColor: "text-blue-600 dark:text-blue-400",
    text: "text-blue-900 dark:text-blue-200",
  },
} as const;

const DISMISSED_KEY = "operioz.dashboard.dismissedAlerts";

function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr.filter((x) => typeof x === "string"));
  } catch {
    /* noop */
  }
  return new Set();
}

function saveDismissed(set: Set<string>) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(set)));
  } catch {
    /* noop */
  }
}

function alertKey(a: DashboardAlert): string {
  return `${a.type}::${a.titre}`;
}

/**
 * Barre d'alertes intelligentes :
 * - Animation slide-in via AnimatePresence à l'apparition/disparition.
 * - Chaque alerte peut être fermée individuellement, mémorisé en localStorage.
 * - Bouton "Voir" cliquable si `lien` fourni.
 */
export function AlertsBar({ alerts, onNavigate }: AlertsBarProps) { const { t } = useTranslation("dashboard");
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());

  useEffect(() => {
    saveDismissed(dismissed);
  }, [dismissed]);

  const visible = alerts.filter((a) => !dismissed.has(alertKey(a)));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {visible.map((alert) => {
          const key = alertKey(alert);
          const style = ALERT_STYLES[alert.type];
          const Icon = style.icon;
          return (
            <motion.div
              key={key}
              layout
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.96 }}
              transition={{ duration: 0.25 }}
              className={`flex items-start gap-3 rounded-lg border ${style.border} ${style.bg} p-3`}
            >
              <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${style.iconColor}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${style.text}`}>{alert.titre}</p>
                {alert.message && (
                  <p className="text-xs text-muted-foreground mt-0.5">{alert.message}</p>
                )}
              </div>
              {alert.lien && onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate(alert.lien ?? "")}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${style.text} hover:bg-white/40 dark:hover:bg-white/5 transition-colors`}
                >
                  {t("alertVoir")} <ArrowRight className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  setDismissed((prev) => {
                    const next = new Set(prev);
                    next.add(key);
                    return next;
                  })
                }
                aria-label={t("alertFermer")}
                className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/40 dark:hover:bg-white/5 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

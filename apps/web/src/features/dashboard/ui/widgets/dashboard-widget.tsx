import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

/** Conteneur de widget du dashboard — re-port de components/dashboard/DashboardWidget (i18n, typé). */
interface DashboardWidgetProps {
  id: string; title: string; subtitle?: string; icon?: ReactNode; actions?: ReactNode;
  removable?: boolean; onRemove?: () => void; className?: string; children: ReactNode;
}
export function DashboardWidget({ id, title, subtitle, icon, actions, removable, onRemove, className, children }: DashboardWidgetProps) {
  const { t } = useTranslation("dashboard");
  return (
    <div data-widget-id={id} className={`relative bg-card text-card-foreground rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow cursor-default ${className || ""}`}>
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/60 pr-20">
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="shrink-0">{icon}</span>}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight truncate">{title}</h3>
            {subtitle && <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 absolute top-2 right-2">
          {actions}
          {removable && onRemove && (
            <button type="button" onClick={onRemove} aria-label={t("masquerWidget")} className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"><X className="h-3.5 w-3.5" /></button>
          )}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

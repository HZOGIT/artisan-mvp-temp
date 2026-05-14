import { GripVertical, X } from "lucide-react";

interface DashboardWidgetProps {
  id: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  /** Si true, affiche un bouton X qui appelle onRemove. */
  removable?: boolean;
  onRemove?: () => void;
  /** Active le drag HTML5 natif. */
  enableDrag?: boolean;
  className?: string;
  children: React.ReactNode;
  // ── Drag state piloté par le parent ───────────────────────────────────
  /** True si CE widget est actuellement en cours de drag. */
  isDragged?: boolean;
  /** True si CE widget est la cible de drop courante (un autre widget est traîné par-dessus). */
  isDropTarget?: boolean;
  onDragStart?: (id: string) => void;
  onDragOver?: (e: React.DragEvent, id: string) => void;
  onDragLeave?: (id: string) => void;
  onDrop?: (id: string) => void;
  onDragEnd?: () => void;
}

/**
 * Conteneur de widget avec drag & drop HTML5 natif.
 *
 * On a abandonné @dnd-kit : sur le Dashboard Operioz, ses pointer events
 * étaient absorbés quelque part dans la chaîne de wrappers (DashboardLayout
 * rail/bottom-nav, AssistantDrawer, Recharts SVG, framer-motion résiduel)
 * — confirmé par /dnd-test qui marche en isolation mais pas /dashboard
 * (console vide, aucun event sensor déclenché). Le drag HTML5 natif est
 * géré par le navigateur lui-même : zéro chance d'interception côté React.
 *
 * Limite connue : HTML5 drag & drop ne déclenche pas pour les events tactiles
 * sur mobile. Le réordonnancement est donc desktop-only ; le masquage de
 * widgets via le panneau "Personnaliser" reste accessible sur mobile.
 */
export function DashboardWidget({
  id,
  title,
  subtitle,
  icon,
  actions,
  removable,
  onRemove,
  enableDrag = true,
  className,
  children,
  isDragged,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: DashboardWidgetProps) {
  return (
    <div
      data-widget-id={id}
      draggable={enableDrag}
      onDragStart={(e) => {
        if (!enableDrag) return;
        // Indispensable pour que Firefox déclenche dragstart.
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", id);
        onDragStart?.(id);
      }}
      onDragOver={(e) => {
        if (!enableDrag) return;
        e.preventDefault(); // Autorise le drop
        e.dataTransfer.dropEffect = "move";
        onDragOver?.(e, id);
      }}
      onDragEnter={(e) => {
        if (!enableDrag) return;
        e.preventDefault();
      }}
      onDragLeave={() => {
        if (!enableDrag) return;
        onDragLeave?.(id);
      }}
      onDrop={(e) => {
        if (!enableDrag) return;
        e.preventDefault();
        onDrop?.(id);
      }}
      onDragEnd={() => {
        if (!enableDrag) return;
        onDragEnd?.();
      }}
      style={{
        opacity: isDragged ? 0.4 : 1,
        cursor: enableDrag ? "grab" : "default",
      }}
      className={`group/widget relative bg-card text-card-foreground rounded-xl border shadow-sm hover:shadow-md transition-all select-none ${
        isDragged ? "shadow-2xl ring-2 ring-primary/40" : ""
      } ${
        isDropTarget
          ? "ring-2 ring-dashed ring-primary outline outline-2 outline-offset-2 outline-primary/40 bg-primary/5"
          : "border-border"
      } ${className || ""}`}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/60 pr-20">
        <div className="flex items-center gap-2 min-w-0">
          {enableDrag && (
            <span
              aria-hidden
              className="shrink-0 h-7 w-7 inline-flex items-center justify-center text-muted-foreground/50 group-hover/widget:text-muted-foreground transition-colors"
              title="Glissez pour réorganiser"
            >
              <GripVertical className="h-4 w-4" />
            </span>
          )}
          {icon && <span className="shrink-0">{icon}</span>}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight truncate">{title}</h3>
            {subtitle && (
              <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 absolute top-2 right-2">
          {actions}
          {removable && onRemove && (
            <button
              type="button"
              // Empêche le draggable parent de prendre la main quand on clique X.
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              aria-label="Masquer le widget"
              className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
              style={{ cursor: "pointer" }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div
        className="p-4"
        // Empêche que le contenu interactif (charts, boutons) déclenche un
        // drag accidentel. Les enfants gardent leur interactivité.
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
      >
        {children}
      </div>
    </div>
  );
}

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { GripVertical, X } from "lucide-react";

interface DashboardWidgetProps {
  id: string;
  title: string;
  /** Description courte sous le titre. */
  subtitle?: string;
  /** Icône à gauche du titre. */
  icon?: React.ReactNode;
  /** Actions rendues à droite du header (boutons "Voir tout" etc.). */
  actions?: React.ReactNode;
  /** Si true, affiche un bouton X qui appelle onRemove. */
  removable?: boolean;
  onRemove?: () => void;
  /** Si true (mode édition), le widget est draggable et le handle est visible en permanence. */
  draggable?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Conteneur réutilisable pour chaque widget du dashboard.
 *
 * - Le wrapper externe est un `<div>` plat (pas un `motion.div`) auquel @dnd-kit
 *   applique son `transform` et sa `transition`. Mélanger `motion.div` avec
 *   la prop `layout` ici fait collision : framer-motion essaie de gérer son
 *   propre transform via FLIP et écrase celui que @dnd-kit pose pendant le
 *   drag → le widget reste figé ou saute. Confirmé en lisant le bug report.
 * - L'animation d'entrée (fade + scale) est portée par un `<motion.div>`
 *   interne qui ne touche pas au transform du wrapper.
 * - Le handle de drag (GripVertical) reçoit `listeners` ; `attributes` est
 *   également posé sur le handle pour fournir les ARIA (role/aria-pressed/
 *   tabIndex) au seul élément focusable destiné au drag.
 */
export function DashboardWidget({
  id,
  title,
  subtitle,
  icon,
  actions,
  removable,
  onRemove,
  draggable = true,
  className,
  children,
}: DashboardWidgetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !draggable });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.6 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group/widget relative bg-card text-card-foreground rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow ${
        isDragging ? "shadow-2xl ring-2 ring-primary/30" : ""
      } ${className || ""}`}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/60">
          <div className="flex items-center gap-2 min-w-0">
            {draggable && (
              <button
                type="button"
                {...attributes}
                {...listeners}
                aria-label="Déplacer le widget"
                className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-accent cursor-grab active:cursor-grabbing opacity-50 group-hover/widget:opacity-100 transition-opacity touch-none"
              >
                <GripVertical className="h-4 w-4" />
              </button>
            )}
            {icon && <span className="shrink-0">{icon}</span>}
            <div className="min-w-0">
              <h3 className="text-sm font-semibold tracking-tight truncate">{title}</h3>
              {subtitle && (
                <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {actions}
            {removable && onRemove && (
              <button
                type="button"
                onClick={onRemove}
                aria-label="Masquer le widget"
                className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="p-4">{children}</div>
      </motion.div>
    </div>
  );
}

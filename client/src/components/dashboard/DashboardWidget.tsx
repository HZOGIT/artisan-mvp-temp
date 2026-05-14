import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  /** Si false, désactive le drag (pour les widgets fixes ou en mode lecture). */
  draggable?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Conteneur réutilisable pour chaque widget du dashboard.
 *
 * Stratégie DnD volontairement minimaliste :
 *  - Wrapper externe = simple <div> auquel @dnd-kit applique transform +
 *    transition via le style. AUCUN motion.div à l'intérieur du sortable
 *    pour éviter toute interférence framer-motion ↔ pointer events.
 *  - Handle de drag dédié en position absolute top-right : reçoit
 *    `listeners` + `attributes`. Le reste du widget reste cliquable
 *    normalement (header X, contenu interactif).
 *  - L'animation d'entrée est gérée au niveau parent via les transitions
 *    CSS de @dnd-kit (qui anime aussi le réarrangement smooth des voisins).
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
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 999 : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-widget-id={id}
      className={`group/widget relative bg-card text-card-foreground rounded-xl border border-border shadow-sm hover:shadow-md ${
        isDragging ? "shadow-2xl ring-2 ring-primary/30" : ""
      } ${className || ""}`}
    >
      {/* Handle de drag — absolute top-right, toujours dans le flux pointer,
          jamais masqué par opacity-0 (ce qui pouvait sembler le rendre
          inactif lors des tests utilisateur). */}
      {draggable && (
        <div
          {...attributes}
          {...listeners}
          aria-label={`Déplacer le widget ${title}`}
          className="absolute top-2 right-12 z-10 h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-accent cursor-grab active:cursor-grabbing opacity-50 group-hover/widget:opacity-100 transition-opacity touch-none select-none"
        >
          <GripVertical className="h-4 w-4" />
        </div>
      )}

      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/60 pr-20">
        <div className="flex items-center gap-2 min-w-0">
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
    </div>
  );
}

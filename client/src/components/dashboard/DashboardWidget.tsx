import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  /** Si false, désactive le drag. */
  draggable?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Conteneur sortable pour les widgets du dashboard.
 *
 * Alignement strict sur le pattern de /dnd-test qui fonctionne :
 *  - `attributes` + `listeners` sont posés SUR LE DIV RACINE (le même qui
 *    porte setNodeRef). Le widget entier est le drag handle. C'est aussi
 *    la recommandation officielle @dnd-kit pour le cas simple.
 *  - L'icône GripVertical reste comme repère visuel (cursor-grab) mais
 *    elle n'a plus de listeners séparés.
 *  - Le bouton X de masquage appelle `stopPropagation` sur onPointerDown
 *    et onClick pour ne pas amorcer un drag quand on tente juste de
 *    masquer le widget.
 *  - Aucun framer-motion à l'intérieur du sortable : zéro chance
 *    d'interception de pointer events.
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
      {...attributes}
      {...listeners}
      className={`group/widget relative bg-card text-card-foreground rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow touch-none select-none ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      } ${isDragging ? "shadow-2xl ring-2 ring-primary/30" : ""} ${className || ""}`}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/60 pr-20">
        <div className="flex items-center gap-2 min-w-0">
          {draggable && (
            <span
              aria-hidden
              className="shrink-0 h-7 w-7 inline-flex items-center justify-center text-muted-foreground/50 group-hover/widget:text-muted-foreground transition-colors"
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
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              aria-label="Masquer le widget"
              className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Le contenu reste interactif (les charts Recharts, les boutons "Voir
          tout" etc.). Pour qu'un clic ne déclenche pas un drag par accident,
          on s'appuie sur PointerSensor activationConstraint distance: 8 :
          un clic sans mouvement n'active pas le drag. */}
      <div className="p-4">{children}</div>
    </div>
  );
}

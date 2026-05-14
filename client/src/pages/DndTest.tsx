import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/**
 * Page d'isolation pour diagnostiquer le drag & drop @dnd-kit.
 *
 * Volontairement rendue COMME ROUTE PUBLIQUE de premier niveau (pas dans
 * AuthenticatedRoutes) → aucun DashboardLayout, aucun AssistantDrawer,
 * aucun motion.div parent. Si le drag fonctionne ici mais pas sur
 * /dashboard, le bug est forcément dans un wrapper parent (layout,
 * MonAssistant, header sticky, etc.) et pas dans @dnd-kit lui-même.
 *
 * URL : /dnd-test
 */

function SortableItem({ id }: { id: string }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        padding: "16px",
        margin: "8px",
        background: isDragging ? "#e0e7ff" : "white",
        border: "2px solid #6366f1",
        borderRadius: "8px",
        cursor: "grab",
        userSelect: "none",
        fontFamily: "system-ui, sans-serif",
        color: "#111827",
        zIndex: isDragging ? 999 : "auto",
      }}
      {...attributes}
      {...listeners}
    >
      Widget {id} — Clique et glisse moi !
    </div>
  );
}

export default function DndTest() {
  const [items, setItems] = useState<string[]>(["A", "B", "C", "D"]);
  const [log, setLog] = useState<string[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const appendLog = (msg: string) => {
    const stamp = new Date().toLocaleTimeString("fr-FR");
    setLog((l) => [...l.slice(-9), `${stamp} — ${msg}`]);
  };

  return (
    <div
      style={{
        padding: "32px",
        maxWidth: "480px",
        margin: "0 auto",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ marginBottom: "8px", fontSize: 24, fontWeight: 700 }}>
        Test Drag &amp; Drop isolé
      </h1>
      <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 16 }}>
        Si le drag fonctionne ici mais pas sur /dashboard, le bug est dans un
        wrapper parent — pas dans @dnd-kit.
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => appendLog(`Drag start: ${active.id}`)}
        onDragEnd={({ active, over }) => {
          appendLog(`Drag end: ${active.id} → ${over?.id ?? "(out)"}`);
          if (over && active.id !== over.id) {
            setItems((prev) =>
              arrayMove(
                prev,
                prev.indexOf(String(active.id)),
                prev.indexOf(String(over.id))
              )
            );
          }
        }}
        onDragCancel={() => appendLog("Drag cancel")}
      >
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          {items.map((id) => (
            <SortableItem key={id} id={id} />
          ))}
        </SortableContext>
      </DndContext>

      <div style={{ marginTop: 24 }}>
        <p style={{ fontSize: 12, color: "#374151", fontWeight: 600, marginBottom: 4 }}>
          Ordre actuel : {items.join(" → ")}
        </p>
        <details>
          <summary style={{ fontSize: 12, color: "#6b7280", cursor: "pointer" }}>
            Journal des events ({log.length})
          </summary>
          <pre
            style={{
              marginTop: 8,
              padding: 8,
              background: "#f3f4f6",
              borderRadius: 6,
              fontSize: 11,
              maxHeight: 200,
              overflow: "auto",
            }}
          >
            {log.length === 0 ? "(aucun event encore)" : log.join("\n")}
          </pre>
        </details>
      </div>
    </div>
  );
}

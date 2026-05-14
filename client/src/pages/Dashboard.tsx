import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import {
  Euro,
  FileText,
  Receipt,
  Target,
  TrendingUp,
  Users,
  Settings2,
  LayoutGrid,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard, type StatCardColor } from "@/components/dashboard/StatCard";
import { WelcomeBanner } from "@/components/dashboard/WelcomeBanner";
import { AlertsBar, type DashboardAlert } from "@/components/dashboard/AlertsBar";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { DashboardWidget } from "@/components/dashboard/DashboardWidget";
import {
  CustomizePanel,
  type CustomizableWidget,
} from "@/components/dashboard/CustomizePanel";
import { RevenueChartWidget } from "@/components/dashboard/widgets/RevenueChart";
import { DevisRepartitionWidget } from "@/components/dashboard/widgets/DevisRepartition";
import { TopClientsWidget } from "@/components/dashboard/widgets/TopClients";
import { RecentActivityWidget } from "@/components/dashboard/widgets/RecentActivity";
import { UpcomingInterventionsWidget } from "@/components/dashboard/widgets/UpcomingInterventions";
import { ObjectifsWidget } from "@/components/dashboard/widgets/Objectifs";

// ============================================================================
// Définition des widgets disponibles dans le dashboard
// ============================================================================

interface WidgetDef extends CustomizableWidget {
  render: () => React.ReactNode;
}

function useWidgetDefinitions(): WidgetDef[] {
  return useMemo(
    () => [
      {
        id: "revenue",
        label: "Évolution du CA",
        description: "Chiffre d'affaires sur les 6 derniers mois",
        render: () => <RevenueChartWidget />,
      },
      {
        id: "devisRepartition",
        label: "Répartition des devis",
        description: "Distribution par statut (brouillon, envoyé, accepté…)",
        render: () => <DevisRepartitionWidget />,
      },
      {
        id: "topClients",
        label: "Top clients",
        description: "Vos 5 meilleurs clients par chiffre d'affaires",
        render: () => <TopClientsWidget />,
      },
      {
        id: "recentActivity",
        label: "Activité récente",
        description: "Derniers devis, factures, clients et interventions",
        render: () => <RecentActivityWidget />,
      },
      {
        id: "upcomingInterventions",
        label: "Prochaines interventions",
        description: "Vos 3 prochains rendez-vous planifiés",
        render: () => <UpcomingInterventionsWidget />,
      },
      {
        id: "objectifs",
        label: "Objectifs du mois",
        description: "Progression CA, devis et nouveaux clients",
        render: () => <ObjectifsWidget />,
      },
    ],
    []
  );
}

const DEFAULT_ORDER = [
  "revenue",
  "devisRepartition",
  "topClients",
  "recentActivity",
  "upcomingInterventions",
  "objectifs",
];

const ORDER_KEY = "operioz.dashboard.widgetOrder";
const HIDDEN_KEY = "operioz.dashboard.hiddenWidgets";

function loadOrder(allIds: string[]): string[] {
  if (typeof window === "undefined") return allIds;
  try {
    const raw = window.localStorage.getItem(ORDER_KEY);
    if (!raw) return allIds;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return allIds;
    // Garde uniquement les ids encore valides + ajoute en fin les nouveaux ids.
    const valid = parsed.filter((id: unknown) => typeof id === "string" && allIds.includes(id));
    const missing = allIds.filter((id) => !valid.includes(id));
    return [...valid, ...missing];
  } catch {
    return allIds;
  }
}

function saveOrder(order: string[]) {
  try {
    window.localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  } catch {
    /* noop */
  }
}

function loadHidden(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(HIDDEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((x) => typeof x === "string"));
    }
  } catch {
    /* noop */
  }
  return new Set();
}

function saveHidden(set: Set<string>) {
  try {
    window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(set)));
  } catch {
    /* noop */
  }
}

// ============================================================================
// Page Dashboard
// ============================================================================

const formatEUR = (v: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { data: stats, isLoading: statsLoading } = trpc.dashboard.getStats.useQuery();
  const { data: conversionRate } = trpc.dashboard.getConversionRate.useQuery();
  const { data: alerts } = trpc.dashboard.getAlerts.useQuery();
  const { data: objectifs } = trpc.dashboard.getObjectifs.useQuery();

  const widgetDefs = useWidgetDefinitions();
  const allIds = useMemo(() => widgetDefs.map((w) => w.id), [widgetDefs]);

  const [order, setOrder] = useState<string[]>(() => loadOrder(DEFAULT_ORDER));
  const [hidden, setHidden] = useState<Set<string>>(() => loadHidden());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  useEffect(() => {
    saveOrder(order);
  }, [order]);

  useEffect(() => {
    saveHidden(hidden);
  }, [hidden]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    // [DnD] Logs diagnostic temporaires - a retirer une fois le drag valide.
    console.log("[DnD] drag started", event.active.id);
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    console.log("[DnD] drag ended", event.active.id, "->", event.over?.id);
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder((prev) => {
      const from = prev.indexOf(String(active.id));
      const to = prev.indexOf(String(over.id));
      if (from < 0 || to < 0) return prev;
      return arrayMove(prev, from, to);
    });
  };

  const handleToggleHidden = (id: string, visible: boolean) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleReset = () => {
    setOrder(DEFAULT_ORDER);
    setHidden(new Set());
  };

  // ── Données dérivées ────────────────────────────────────────────────────
  const firstName = useMemo(() => {
    const n = (user as any)?.name || "";
    return n.split(/\s+/)[0] || null;
  }, [user]);

  const rate =
    typeof conversionRate === "number"
      ? conversionRate
      : (conversionRate as any)?.rate || 0;
  const devisAcceptes =
    typeof conversionRate === "number"
      ? undefined
      : (conversionRate as any)?.devisAcceptes;
  const totalDevisConv =
    typeof conversionRate === "number"
      ? undefined
      : (conversionRate as any)?.totalDevis;

  const facturesImpayeesCount = stats?.facturesImpayees?.count || 0;
  const facturesImpayeesTotal = stats?.facturesImpayees?.total || 0;

  // Visible widgets in order
  const visibleOrder = order.filter((id) => !hidden.has(id) && allIds.includes(id));
  const widgetById = useMemo(
    () => Object.fromEntries(widgetDefs.map((w) => [w.id, w])),
    [widgetDefs]
  );

  // Stat cards definition
  const statCards: Array<{
    title: string;
    value: number | string;
    subtitle?: string;
    icon: typeof Euro;
    color: StatCardColor;
    formatter?: (v: number) => string;
    suffix?: string;
    onClick?: () => void;
    badge?: number;
    pulse?: boolean;
    footer?: React.ReactNode;
  }> = [
    {
      title: "CA du mois",
      value: stats?.caMonth || 0,
      subtitle: `${formatEUR(stats?.caYear || 0)} cette année`,
      icon: Euro,
      color: "blue",
      formatter: formatEUR,
      onClick: () => setLocation("/rapports"),
    },
    {
      title: "CA de l'année",
      value: stats?.caYear || 0,
      subtitle:
        objectifs?.objectifCA && objectifs.objectifCA > 0
          ? `Objectif : ${formatEUR(objectifs.objectifCA)}`
          : "Cumul annuel",
      icon: TrendingUp,
      color: "green",
      formatter: formatEUR,
      onClick: () => setLocation("/rapports"),
    },
    {
      title: "Devis en attente",
      value: stats?.devisEnCours || 0,
      subtitle: stats?.devisEnCours
        ? `${stats.devisEnCours} à relancer`
        : "Aucun devis en attente",
      icon: FileText,
      color: "orange",
      onClick: () => setLocation("/devis?filtre=envoye"),
      badge: (stats?.devisEnCours || 0) > 10 ? stats?.devisEnCours : undefined,
    },
    {
      title: "Factures impayées",
      value: facturesImpayeesCount,
      subtitle: `${formatEUR(facturesImpayeesTotal)} à encaisser`,
      icon: Receipt,
      color: "red",
      onClick: () => setLocation("/factures?filtre=impayees"),
      pulse: facturesImpayeesCount > 0,
    },
    {
      title: "Clients",
      value: stats?.totalClients || 0,
      subtitle: "Dans votre base",
      icon: Users,
      color: "violet",
      onClick: () => setLocation("/clients"),
    },
    {
      title: "Taux conversion",
      value: Math.round(rate),
      suffix: "%",
      subtitle:
        devisAcceptes !== undefined && totalDevisConv
          ? `${devisAcceptes}/${totalDevisConv} devis acceptés`
          : "Devis acceptés",
      icon: Target,
      color: "cyan",
      onClick: () => setLocation("/statistiques"),
      footer: (
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-cyan-500 transition-all"
            style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
          />
        </div>
      ),
    },
  ];

  if (statsLoading) {
    return (
      <div className="space-y-6">
        <div className="h-32 rounded-2xl bg-muted/60 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-muted/60 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-64 rounded-xl bg-muted/60 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const dashboardAlerts: DashboardAlert[] = (alerts || []) as DashboardAlert[];

  // Pas de motion.div outer : framer-motion sur le parent du sortable peut
  // intercepter les pointer events ou casser le timing de re-render qui
  // active le PointerSensor. /dnd-test fonctionne car il n'a aucun parent
  // framer-motion ; on s'aligne strictement sur ce pattern.
  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <WelcomeBanner
        firstName={firstName}
        devisEnAttente={stats?.devisEnCours || 0}
        facturesImpayees={facturesImpayeesCount}
        interventionsAVenir={stats?.interventionsAVenir || 0}
        onCreateDevis={() => setLocation("/devis/nouveau")}
        onCreateFacture={() => setLocation("/factures")}
        onCreateIntervention={() => setLocation("/interventions")}
      />

      {/* Alerts */}
      <AlertsBar alerts={dashboardAlerts} onNavigate={(path) => setLocation(path)} />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {statCards.map((card, i) => (
          <StatCard key={card.title} {...card} index={i} />
        ))}
      </div>

      {/* Drag & drop widget grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={visibleOrder} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {visibleOrder.map((id) => {
              const widget = widgetById[id];
              if (!widget) return null;
              return (
                <DashboardWidget
                  key={id}
                  id={id}
                  title={widget.label}
                  subtitle={widget.description}
                  removable
                  onRemove={() => handleToggleHidden(id, false)}
                >
                  {widget.render()}
                </DashboardWidget>
              );
            })}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeId && widgetById[activeId] ? (
            <div className="rounded-xl border border-primary/40 bg-card shadow-2xl p-4 opacity-95">
              <p className="text-sm font-semibold">{widgetById[activeId].label}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Déposez ici pour réorganiser
              </p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <LayoutGrid className="h-3.5 w-3.5" /> Actions rapides
        </h2>
        <QuickActions
          onNewDevis={() => setLocation("/devis/nouveau")}
          onNewFacture={() => setLocation("/factures")}
          onNewClient={() => setLocation("/clients/nouveau")}
          onNewIntervention={() => setLocation("/interventions")}
        />
      </div>

      {/* Customize entry point */}
      <div className="flex justify-center pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCustomizeOpen(true)}
        >
          <Settings2 className="h-3.5 w-3.5 mr-2" />
          Personnaliser le dashboard
        </Button>
      </div>

      {/* Customize panel */}
      <CustomizePanel
        isOpen={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        widgets={widgetDefs.map((w) => ({
          id: w.id,
          label: w.label,
          description: w.description,
        }))}
        hiddenIds={hidden}
        onToggle={handleToggleHidden}
        onReset={() => {
          handleReset();
          setCustomizeOpen(false);
        }}
      />
    </div>
  );
}

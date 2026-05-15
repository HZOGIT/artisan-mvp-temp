import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Euro,
  FileText,
  Receipt,
  Target,
  TrendingUp,
  Users,
  Settings2,
  LayoutGrid,
  Check,
  CircleDashed,
  CreditCard,
  Sparkles,
  UserPlus,
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

type DashboardState = "nouveau" | "demarrage" | "confirme";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { data: stats, isLoading: statsLoading } = trpc.dashboard.getStats.useQuery();
  const { data: conversionRate } = trpc.dashboard.getConversionRate.useQuery();
  const { data: alerts } = trpc.dashboard.getAlerts.useQuery();
  const { data: objectifs } = trpc.dashboard.getObjectifs.useQuery();
  const { data: artisanProfile } = trpc.artisan.getProfile.useQuery();

  const widgetDefs = useWidgetDefinitions();
  const allIds = useMemo(() => widgetDefs.map((w) => w.id), [widgetDefs]);

  const [order, setOrder] = useState<string[]>(() => loadOrder(DEFAULT_ORDER));
  const [hidden, setHidden] = useState<Set<string>>(() => loadHidden());
  const [customizeOpen, setCustomizeOpen] = useState(false);

  useEffect(() => {
    saveOrder(order);
  }, [order]);

  useEffect(() => {
    saveHidden(hidden);
  }, [hidden]);

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

  // ── État adaptatif (3 niveaux) ──────────────────────────────────────────
  // Logique : un artisan avec 19 clients + 26 devis doit voir le dashboard
  // complet → state 3 declenche des qu'UN seul des deux compteurs depasse 10.
  const totalClients = stats?.totalClients || 0;
  const totalDevis = stats?.totalDevis || 0;
  const totalFactures = stats?.totalFactures || 0;
  const dashboardState: DashboardState = useMemo(() => {
    if (totalClients < 3 && totalDevis < 3) return "nouveau";
    if (totalClients > 10 || totalDevis > 10) return "confirme";
    return "demarrage";
  }, [totalClients, totalDevis]);

  // ── Checklist d'onboarding (state nouveau uniquement) ───────────────────
  const checklist = useMemo(
    () => [
      {
        id: "profil",
        label: "Compléter votre profil",
        done: !!(artisanProfile as any)?.logo && !!(artisanProfile as any)?.siret,
        icon: UserPlus,
        action: () => setLocation("/profil"),
      },
      {
        id: "client",
        label: "Ajouter votre premier client",
        done: totalClients > 0,
        icon: Users,
        action: () => setLocation("/clients/nouveau"),
      },
      {
        id: "devis",
        label: "Créer votre premier devis",
        done: totalDevis > 0,
        icon: FileText,
        action: () => setLocation("/devis/nouveau"),
      },
      {
        id: "facture",
        label: "Envoyer votre première facture",
        done: totalFactures > 0,
        icon: Receipt,
        action: () => setLocation("/factures"),
      },
      {
        id: "paiement",
        label: "Configurer le paiement en ligne",
        done: false,
        icon: CreditCard,
        action: () => setLocation("/parametres"),
      },
    ],
    [artisanProfile, totalClients, totalDevis, totalFactures, setLocation]
  );
  const checklistDone = checklist.filter((c) => c.done).length;
  const checklistProgress = Math.round((checklistDone / checklist.length) * 100);

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

  // ── STATE 1 — Nouveau : checklist + MonAssistant CTA ────────────────────
  if (dashboardState === "nouveau") {
    return (
      <div className="space-y-6">
        <WelcomeBanner
          firstName={firstName}
          devisEnAttente={stats?.devisEnCours || 0}
          facturesImpayees={facturesImpayeesCount}
          interventionsAVenir={stats?.interventionsAVenir || 0}
          onCreateDevis={() => setLocation("/devis/nouveau")}
          onCreateFacture={() => setLocation("/factures")}
          onCreateIntervention={() => setLocation("/interventions")}
        />

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Vos premières étapes</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {checklistDone} sur {checklist.length} terminé{checklistDone > 1 ? "s" : ""}
              </p>
            </div>
            <span className="text-2xl font-bold tabular-nums">{checklistProgress}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden mb-4">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-cyan-500 transition-all"
              style={{ width: `${checklistProgress}%` }}
            />
          </div>
          <ul className="space-y-2">
            {checklist.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={item.action}
                    className="w-full flex items-center gap-3 rounded-lg p-3 hover:bg-accent/50 transition-colors text-left"
                  >
                    <span className={`shrink-0 h-6 w-6 inline-flex items-center justify-center rounded-full ${
                      item.done ? "bg-emerald-500 text-white" : "border-2 border-muted-foreground/30 text-muted-foreground"
                    }`}>
                      {item.done ? <Check className="h-3.5 w-3.5" /> : <CircleDashed className="h-3 w-3" />}
                    </span>
                    <Icon className={`h-4 w-4 shrink-0 ${item.done ? "text-emerald-500" : "text-muted-foreground"}`} />
                    <span className={`text-sm flex-1 ${item.done ? "line-through text-muted-foreground" : "font-medium"}`}>
                      {item.label}
                    </span>
                    {!item.done && <span className="text-xs text-primary font-medium">Commencer →</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-purple-700 to-indigo-800 text-white p-6 shadow-lg">
          <div aria-hidden className="absolute -top-16 -right-10 h-64 w-64 rounded-full bg-fuchsia-400/20 blur-3xl animate-blob" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-2">
              <span className="h-12 w-12 inline-flex items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
                <Sparkles className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-xl font-bold tracking-tight">MonAssistant peut tout faire pour vous !</h2>
                <p className="text-sm text-violet-100/80">Dites-lui simplement ce que vous voulez faire.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { label: "Crée mon premier devis", path: "/devis/nouveau" },
                { label: "Ajoute mon premier client", path: "/clients/nouveau" },
                { label: "Planifie une intervention", path: "/interventions" },
              ].map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setLocation(s.path)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 px-3 py-2 text-xs font-medium transition-all"
                >
                  {s.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setLocation("/assistant")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white text-violet-700 hover:bg-violet-50 px-3 py-2 text-xs font-semibold transition-all shadow"
              >
                Ouvrir MonAssistant 🎤
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── STATE 2 — Démarrage : 4 cards + 2 widgets + MonAssistant compact ────
  if (dashboardState === "demarrage") {
    const minimalWidgets = ["recentActivity", "upcomingInterventions"];
    return (
      <div className="space-y-6">
        <WelcomeBanner
          firstName={firstName}
          devisEnAttente={stats?.devisEnCours || 0}
          facturesImpayees={facturesImpayeesCount}
          interventionsAVenir={stats?.interventionsAVenir || 0}
          onCreateDevis={() => setLocation("/devis/nouveau")}
          onCreateFacture={() => setLocation("/factures")}
          onCreateIntervention={() => setLocation("/interventions")}
        />

        <AlertsBar alerts={dashboardAlerts} onNavigate={(path) => setLocation(path)} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[statCards[0], statCards[2], statCards[3], statCards[4]].map((card, i) => (
            <StatCard key={card.title} {...card} index={i} />
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {minimalWidgets.map((id) => {
            const widget = widgetById[id];
            if (!widget) return null;
            return (
              <DashboardWidget key={id} id={id} title={widget.label} subtitle={widget.description}>
                {widget.render()}
              </DashboardWidget>
            );
          })}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
          <span className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white shrink-0">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Besoin d'aide ? MonAssistant est là.</p>
            <p className="text-xs text-muted-foreground">Demandez-lui de créer un devis, planifier une intervention…</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setLocation("/assistant")}>
            Ouvrir
          </Button>
        </div>
      </div>
    );
  }

  // ── STATE 3 — Confirmé : dashboard complet ──────────────────────────────
  return (
    <div className="space-y-6">
      <WelcomeBanner
        firstName={firstName}
        devisEnAttente={stats?.devisEnCours || 0}
        facturesImpayees={facturesImpayeesCount}
        interventionsAVenir={stats?.interventionsAVenir || 0}
        onCreateDevis={() => setLocation("/devis/nouveau")}
        onCreateFacture={() => setLocation("/factures")}
        onCreateIntervention={() => setLocation("/interventions")}
      />

      <AlertsBar alerts={dashboardAlerts} onNavigate={(path) => setLocation(path)} />

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {statCards.map((card, i) => (
          <StatCard key={card.title} {...card} index={i} />
        ))}
      </div>

      {/* Grille statique des widgets — l'ordre vient de localStorage,
          les widgets masqués sont filtrés. Le réordonnancement se fait
          via le panneau "Personnaliser" (toggle ON/OFF). */}
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
